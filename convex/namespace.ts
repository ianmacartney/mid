import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import {
  DatabaseReader,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import {
  getOrThrow,
  getManyFrom,
  getOneFrom,
  getOneFromOrThrow,
} from "convex-helpers/server/relationships";
import { asyncMap } from "convex-helpers";
import {
  namespaceAdminAction,
  namespaceAdminMutation,
  namespaceAdminQuery,
  userMutation,
  userQuery,
} from "./functions";
import schema from "./schema";
import { asyncMapChunked, chunk, embed, embedBatch } from "./llm";
import { calculateMidpoint, dotProduct } from "./linearAlgebra";
import { partial } from "convex-helpers/validators";
import { FunctionArgs, paginationOptsValidator } from "convex/server";
import { omit } from "convex-helpers";
import { pick } from "convex-helpers";
import { nullThrows } from "convex-helpers";
import { getTextByTitle } from "./embed";

export const listNamespaces = userQuery({
  args: {},
  handler: async (ctx, args) => {
    if (!ctx.user) {
      return [];
    }

    return getManyFrom(ctx.db, "namespaces", "createdBy", ctx.user?._id);
  },
});

export const upsertNamespace = userMutation({
  args: omit(schema.tables.namespaces.validator.fields, ["createdBy"]),
  handler: async (ctx, args) => {
    // TODO: check that the user is allowed to create a namespace
    if (!ctx.user) {
      throw new Error("Not authenticated");
    }
    const existing = await getOneFrom(ctx.db, "namespaces", "slug", args.name);
    if (existing) {
      if (existing.createdBy !== ctx.user._id) {
        throw new Error("Namespace already exists");
      }
      return existing._id;
    }
    return ctx.db.insert("namespaces", { ...args, createdBy: ctx.user._id });
  },
});

export const listGamesByNamespace = namespaceAdminQuery({
  args: {},
  handler: async (ctx) => {
    return ctx.db
      .query("games")
      .withIndex("namespaceId", (q) => q.eq("namespaceId", ctx.namespace._id))
      .order("desc")
      .take(20);
  },
});

export const update = namespaceAdminMutation({
  args: partial(schema.tables.namespaces.validator.fields),
  handler: async (ctx, args) => {
    return ctx.db.patch(ctx.namespace._id, args);
  },
});

export const getNamespace = namespaceAdminQuery({
  args: {},
  handler: async (ctx, args) => {
    const isEmpty = !(await ctx.db
      .query("texts")
      .withIndex("namespaceId", (q) => q.eq("namespaceId", ctx.namespace._id))
      .first());
    return { ...ctx.namespace, isEmpty };
  },
});

export const addText = namespaceAdminAction({
  args: {
    titled: v.optional(
      v.array(v.object({ title: v.string(), text: v.string() })),
    ),
    texts: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args): Promise<number> => {
    const texts = (args.titled || []).concat(
      (args.texts || []).map((text) => ({ text, title: text })),
    );
    console.debug(
      `Adding ${texts.length} texts to namespace ${ctx.namespace.name}`,
    );
    const textsToEmbed = await asyncMapChunked(texts, async (chunk) =>
      ctx.runMutation(internal.embed.populateTextsFromCache, {
        namespaceId: ctx.namespace._id,
        texts: chunk,
      }),
    );
    console.debug(`Embedding ${textsToEmbed.length} texts`);
    await Promise.all(
      chunk(textsToEmbed).map(async (chunk, i) => {
        console.debug(`Starting chunk ${i} (${chunk.length})`);
        const embeddings = await embedBatch(chunk.map((t) => t.text));
        const toInsert = embeddings.map((embedding, i) => {
          const { title, text } = chunk[i];
          return { title, text, embedding };
        });
        console.debug(`Finished chunk ${i} (${chunk.length})`);
        await ctx.runMutation(internal.embed.insertTexts, {
          namespaceId: ctx.namespace._id,
          texts: toInsert,
        });
        console.debug(`Added chunk ${i} (${chunk.length})`);
      }),
    );
    console.debug(`Finished adding ${texts.length} texts`);
    return textsToEmbed.length;
  },
});

export const paginateText = namespaceAdminQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    return ctx.db
      .query("texts")
      .withIndex("namespaceId", (q) => q.eq("namespaceId", ctx.namespace._id))
      .paginate(args.paginationOpts);
  },
});

export const listMidpoints = namespaceAdminQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    return ctx.db
      .query("midpoints")
      .withIndex("namespaceId", (q) => q.eq("namespaceId", ctx.namespace._id))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const basicVectorSearch = namespaceAdminAction({
  args: { text: v.string() },
  returns: v.array(v.object({ title: v.string(), score: v.number() })),
  handler: async (ctx, args) => {
    const embedding = await embed(args.text);
    const results = await ctx.vectorSearch("embeddings", "embedding", {
      vector: embedding,
      limit: 10,
      filter: (q) => q.eq("namespaceId", ctx.namespace._id),
    });
    const texts: { title: string; score: number }[] = await ctx.runQuery(
      internal.namespace.getResults,
      {
        results,
      },
    );
    return texts;
  },
});

export const getResults = internalQuery({
  args: {
    results: v.array(v.object({ _id: v.id("embeddings"), _score: v.number() })),
  },
  returns: v.array(v.object({ title: v.string(), score: v.number() })),
  handler: async (ctx, args) => {
    return asyncMap(args.results, async ({ _id, _score }) => {
      const text = await getOneFrom(ctx.db, "texts", "embeddingId", _id);
      if (!text) throw new Error("Text not found");
      return { title: text.title, score: _score };
    });
  },
});

function reciprocalRankFusion(aIndex: number, bIndex: number, k?: number) {
  const a = aIndex + 1;
  const b = bIndex + 1;
  return (a + b) / (a * b);
}

export const midpointSearch = namespaceAdminAction({
  args: {
    left: v.string(),
    right: v.string(),
    skipCache: v.optional(v.boolean()),
    strategy: schema.tables.midpoints.validator.fields.strategy,
  },
  handler: async (ctx, args): Promise<Doc<"midpoints">> => {
    const midpoint = await ctx.runQuery(internal.namespace.getMidpoint, {
      namespaceId: ctx.namespace._id,
      left: args.left,
      right: args.right,
    });
    if (!args.skipCache && midpoint) {
      console.debug("Found midpoint in cache");
      return midpoint;
    }
    if (args.strategy === "rank") {
      const [[leftEmbedding, leftResults], [rightEmbedding, rightResults]] =
        await Promise.all(
          [
            [midpoint?.leftEmbedding, args.left] as const,
            [midpoint?.rightEmbedding, args.right] as const,
          ].map(async ([existingEmbedding, text]) => {
            const embedding = existingEmbedding || (await embed(text));
            const results = await ctx.vectorSearch("embeddings", "embedding", {
              vector: embedding,
              limit: 100,
              filter: (q) => q.eq("namespaceId", ctx.namespace._id),
            });
            return [embedding, results] as const;
          }),
        );

      const leftOverallRankById = new Map(
        leftResults.map(({ _id }, i) => [_id, i]),
      );
      const rightOverallRankById = new Map(
        rightResults.map(({ _id }, i) => [_id, i]),
      );
      const rightRankById = new Map(
        rightResults
          .filter(({ _id }) => leftOverallRankById.has(_id))
          .map(({ _id, _score }, i) => [_id, { _score, i }]),
      );

      const topMatches = leftResults
        .filter(({ _id }) => rightRankById.has(_id))
        .map(({ _id, _score: leftScore }, leftRank) => {
          const { _score: rightScore, i: rightRank } = rightRankById.get(_id)!;
          const leftOverallRank = leftOverallRankById.get(_id)!;
          const rightOverallRank = rightOverallRankById.get(_id)!;
          return {
            embeddingId: _id,
            leftScore: leftOverallRank,
            rightScore: rightOverallRank,
            score: reciprocalRankFusion(leftOverallRank, rightOverallRank),
            lxrScore: reciprocalRankFusion(leftRank, rightRank),
          } as FunctionArgs<
            typeof internal.namespace.upsertMidpoint
          >["topMatches"][0];
        })
        .sort((a, b) => b.score - a.score);
      return ctx.runMutation(internal.namespace.upsertMidpoint, {
        left: args.left,
        right: args.right,
        namespaceId: ctx.namespace._id,
        leftEmbedding,
        rightEmbedding,
        topMatches,
        strategy: "rank",
      }) as Promise<Doc<"midpoints">>;
    } else {
      const leftEmbedding = midpoint?.leftEmbedding || (await embed(args.left));
      const rightEmbedding =
        midpoint?.rightEmbedding || (await embed(args.right));

      const midpointEmbedding = calculateMidpoint(
        leftEmbedding,
        rightEmbedding,
      );

      // const overlap: Map<Id<"embeddings">, {left: number; right: number}> = new Map();

      const topMatches = await ctx
        .vectorSearch("embeddings", "embedding", {
          vector: midpointEmbedding,
          limit: 102, // extra two to account for the left and right embeddings
          filter: (q) => q.eq("namespaceId", ctx.namespace._id),
        })
        .then((results) =>
          results.map(
            ({ _id, _score }) =>
              ({
                embeddingId: _id,
                score: _score,
                // leftRank: 0,
                // rightRank: 0,
              }) satisfies FunctionArgs<
                typeof internal.namespace.upsertMidpoint
              >["topMatches"][0],
          ),
        );
      return ctx.runMutation(internal.namespace.upsertMidpoint, {
        left: args.left,
        right: args.right,
        namespaceId: ctx.namespace._id,
        leftEmbedding,
        rightEmbedding,
        midpointEmbedding,
        topMatches,
        strategy: "midpoint",
      }) as Promise<Doc<"midpoints">>;
    }
  },
});

export function findRank(scores: number[], score: number) {
  const rank = scores.findIndex((m) => m <= score + 0.00001);
  if (rank === -1) {
    return Infinity;
  }
  return rank;
}

const midpointFields = schema.tables.midpoints.validator.fields;

export const upsertMidpoint = internalMutation({
  args: {
    ...midpointFields,
    topMatches: v.array(
      v.object({
        embeddingId: v.id("embeddings"),
        ...partial(omit(midpointFields.topMatches.element.fields, ["title"])),
        ...pick(midpointFields.topMatches.element.fields, ["score"]),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const topMatches: Doc<"midpoints">["topMatches"] = await asyncMap(
      args.topMatches,
      async ({ embeddingId, ...rest }) => {
        const text = await getOneFromOrThrow(
          ctx.db,
          "texts",
          "embeddingId",
          embeddingId,
        );
        if (!args.midpointEmbedding) {
          const { leftScore, rightScore, lxrScore, score } = rest;
          if (
            leftScore === undefined ||
            rightScore === undefined ||
            lxrScore === undefined
          ) {
            throw new Error(
              "Missing scores: " + text.title + JSON.stringify(rest),
            );
          }
          return { title: text.title, score, leftScore, rightScore, lxrScore };
        }
        const embedding = await getOrThrow(ctx, embeddingId);
        const leftScore = dotProduct(args.leftEmbedding, embedding.embedding);
        const rightScore = dotProduct(args.rightEmbedding, embedding.embedding);
        return {
          title: text.title,
          ...rest,
          leftScore,
          rightScore,
          lxrScore: leftScore * rightScore,
        };
      },
    );
    const midpoint = await ctx.db
      .query("midpoints")
      .withIndex("namespaceId", (q) =>
        q
          .eq("namespaceId", args.namespaceId)
          .eq("left", args.left)
          .eq("right", args.right),
      )
      .first();
    if (midpoint) {
      await ctx.db.patch(midpoint._id, {
        midpointEmbedding: args.midpointEmbedding,
        topMatches,
      });
    }
    const midpointId =
      midpoint?._id ||
      (await ctx.db.insert("midpoints", {
        ...args,
        topMatches,
      }));
    return ctx.db.get(midpointId);
  },
});

export const deleteMidpoint = namespaceAdminMutation({
  args: { midpointId: v.id("midpoints") },
  handler: async (ctx, args) => {
    const midpoint = await ctx.db.get(args.midpointId);
    if (midpoint && midpoint.namespaceId !== ctx.namespace._id) {
      throw new Error("Midpoint not in authorized namespace");
    }
    if (midpoint) {
      const game = await ctx.db
        .query("games")
        .withIndex("namespaceId", (q) => q.eq("namespaceId", ctx.namespace._id))
        .filter((q) => q.eq(q.field("left"), midpoint.left))
        .filter((q) => q.eq(q.field("right"), midpoint.right))
        .first();
      if (game) {
        throw new Error("Cannot delete midpoint with active game");
      }
      await ctx.db.delete(args.midpointId);
    }
  },
});

export async function lookupMidpoint(
  ctx: { db: DatabaseReader },
  args: { namespaceId: Id<"namespaces">; left: string; right: string },
) {
  return ctx.db
    .query("midpoints")
    .withIndex("namespaceId", (q) =>
      q
        .eq("namespaceId", args.namespaceId)
        .eq("left", args.left)
        .eq("right", args.right),
    )
    .unique();
}

export const getMidpoint = internalQuery({
  args: {
    namespaceId: v.id("namespaces"),
    left: v.string(),
    right: v.string(),
  },
  handler: lookupMidpoint,
});

export const makeGuess = namespaceAdminAction({
  args: { guess: v.string(), left: v.string(), right: v.string() },
  handler: async (ctx, args) => {
    const embedding = await embed(args.guess);
    const results: {
      rank: number;
      score: number;
      leftScore: number;
      rightScore: number;
      lxrScore: number;
    } = await ctx.runQuery(internal.namespace.calculateGuess, {
      namespaceId: ctx.namespace._id,
      embedding,
      ...omit(args, ["guess"]),
    });
    return { ...results, guess: args.guess };
  },
});

export const calculateGuess = internalQuery({
  args: {
    namespaceId: v.id("namespaces"),
    left: v.string(),
    right: v.string(),
    embedding: v.array(v.number()),
  },
  handler: async (ctx, { embedding, ...args }) => {
    const midpoint = nullThrows(await lookupMidpoint(ctx, args));
    return computeGuess(ctx, midpoint, embedding);
  },
});

export async function computeGuess(
  ctx: { db: DatabaseReader },
  midpoint: Doc<"midpoints">,
  embedding: number[],
) {
  if (midpoint.strategy !== "rank") {
    const score = dotProduct(midpoint.midpointEmbedding!, embedding);
    const leftScore = dotProduct(midpoint.leftEmbedding, embedding);
    const rightScore = dotProduct(midpoint.rightEmbedding, embedding);
    const lxrScore = leftScore * rightScore;
    const rank = findRank(
      midpoint.topMatches.map((m) => m.score),
      score,
    );
    return {
      rank,
      score,
      leftScore,
      rightScore,
      lxrScore,
    };
  } else {
    const leftScore = dotProduct(midpoint.leftEmbedding, embedding);
    const rightScore = dotProduct(midpoint.rightEmbedding, embedding);
    const scores = await asyncMap(midpoint.topMatches, async (match, i) => {
      const text = await getTextByTitle(ctx, midpoint.namespaceId, match.title);
      const rankedEmbedding = await getOrThrow(ctx, text!.embeddingId);
      const score = dotProduct(rankedEmbedding.embedding, embedding);
      return score;
    });
    const [topScore, rank] = scores.reduce(
      ([max], score, i) => [Math.max(max, score), i],
      [-Infinity, Infinity],
    );
    return {
      rank,
      score: topScore,
      leftScore,
      rightScore,
      lxrScore: midpoint.topMatches[rank].lxrScore,
    };
  }
}

export const makeGame = namespaceAdminMutation({
  args: {
    left: v.string(),
    right: v.string(),
  },
  handler: async (ctx, args) => {
    const midpoint = await lookupMidpoint(ctx, {
      ...args,
      namespaceId: ctx.namespace._id,
    });
    if (!midpoint) {
      throw new Error("Midpoint not found");
    } else if (midpoint.namespaceId !== ctx.namespace._id) {
      throw new Error("Midpoint not in authorized namespace");
    }
    return ctx.db.insert("games", {
      ...args,
      namespaceId: ctx.namespace._id,
      active: false,
    });
  },
});

export const setGameActive = namespaceAdminMutation({
  args: { gameId: v.id("games"), active: v.boolean() },
  handler: async (ctx, args) => {
    const game = await getOrThrow(ctx, args.gameId);
    if (game.namespaceId !== ctx.namespace._id) {
      throw new Error("Game not in authorized namespace");
    }
    await ctx.db.patch(args.gameId, { active: args.active });
  },
});
