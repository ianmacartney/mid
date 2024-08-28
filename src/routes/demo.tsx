import { createFileRoute } from "@tanstack/react-router";
import { SignInForm } from "@/SignInForm";
import {
  Authenticated,
  Unauthenticated,
  useAction,
  useMutation,
  usePaginatedQuery,
  useQuery,
} from "convex/react";
import Game from "@/components/Game";
import { api } from "@convex/_generated/api";
import { useEffect, useMemo, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Strategy } from "@convex/namespace";
import { Doc } from "@convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import { FunctionReturnType } from "convex/server";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/demo")({
  component: Demo,
});

function Demo() {
  return (
    <div className="flex flex-col items-center min-h-screen h-full overflow-scroll bg-background text-foreground">
      <main className="flex flex-col items-center justify-center w-full max-w-4xl gap-8 px-6 py-8">
        <Authenticated>
          <CompareEmojis />
          <SearchFeelings />
        </Authenticated>
        <Unauthenticated>
          <SignInForm />
        </Unauthenticated>
      </main>
    </div>
  );
}

function CompareEmojis() {
  const namespace = "emojis";
  const emojisResult = usePaginatedQuery(
    api.namespace.paginateText,
    { namespace },
    { initialNumItems: 100 },
  );
  useEffect(() => {
    if (emojisResult.status === "CanLoadMore") emojisResult.loadMore(100);
  }, [emojisResult.status]);
  const [words, setWords] = useState({ left: "", right: "", guess: "" });
  const sorted = emojisResult.results
    .slice()
    .sort((a, b) => b.title.localeCompare(a.title));

  const search = useAction(api.namespace.midpointSearch);
  const [midpoint, setMidpoint] = useState<Doc<"midpoints">>();
  useEffect(() => {
    const { left, right } = words;
    if (!left || !right) return;
    search({ namespace, left, right }).then((results) => {
      setMidpoint(results);
    });
  }, [namespace, words.left, words.right]);

  return (
    <div className="flex items-center gap-4">
      <div className="flex flex-col items-center gap-4">
        <h2 className="text-2xl mb-4">Compare Emojis</h2>
        <div className="flex gap-4">
          <Select
            value={words.left}
            onValueChange={(v) => setWords((w) => ({ ...w, left: v }))}
          >
            <SelectTrigger className="rounded-md border border-input bg-background px-3 py-2 text-xl ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50">
              <SelectValue placeholder="🫥" />
            </SelectTrigger>
            <SelectContent>
              {sorted.map((emoji) => (
                <SelectItem key={emoji._id} value={emoji.title}>
                  <span className="text-xl">{emoji.title}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span>???</span>
          <Select
            value={words.right}
            onValueChange={(v) => setWords((w) => ({ ...w, right: v }))}
          >
            <SelectTrigger className="rounded-md border border-input bg-background px-3 py-2 text-xl ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50">
              <SelectValue placeholder="🫥" />
            </SelectTrigger>
            <SelectContent>
              {sorted.map((emoji) => (
                <SelectItem key={emoji._id} value={emoji.title}>
                  <span className="text-xl">{emoji.title}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-4">
          <Midpoint
            midpoint={midpoint}
            left={words.left}
            right={words.right}
            strategy={"rankOverall"}
          />
          <Midpoint
            midpoint={midpoint}
            left={words.left}
            right={words.right}
            strategy={"rank"}
          />
          <Midpoint
            midpoint={midpoint}
            left={words.left}
            right={words.right}
            strategy={"midpoint"}
          />
          <Midpoint
            midpoint={midpoint}
            left={words.left}
            right={words.right}
            strategy={"lxr"}
          />
        </div>
      </div>
    </div>
  );
}

function Midpoint({
  midpoint,
  left,
  right,
  strategy,
}: {
  midpoint: Doc<"midpoints"> | undefined;
  right: string;
  left: string;
  strategy: Strategy;
}) {
  const getScore = (match: Doc<"midpoints">["topMatches"][0]): number => {
    switch (strategy) {
      case "lxr":
        return match.lxrScore;
      case "midpoint":
        return match.score;
      case "rank":
        return match.rrfScore;
      case "rankOverall":
        return match.rrfOverallScore;
    }
  };

  function strategyName(strategy: Strategy) {
    switch (strategy) {
      case "lxr":
        return `Cosine similarity to ${left} multiplied by the cosine similarity to ${right}`;
      case "midpoint":
        return "Cosine similarity to the midpoint (centroid) of the two embeddings";
      case "rank":
        return "Reciprocal Rank Fusion, but using the rank within emojis showing up in both searches";
      case "rankOverall":
        return `Comparing the emoji's ranked order in a vector search for each of ${left} and ${right}: sum of 1/rank (called Reciprocal Rank Fusion)`;
    }
  }

  function getHoverText(match: Doc<"midpoints">["topMatches"][0]) {
    switch (strategy) {
      case "lxr":
        return `Score: ${getScore(match).toFixed(2)}, Left: ${match.leftScore.toFixed(2)}, Right: ${match.rightScore.toFixed(2)}`;
      case "midpoint":
        return `Score: ${getScore(match).toFixed(2)}, Left: ${match.leftScore.toFixed(2)}, Right: ${match.rightScore.toFixed(2)}`;
      case "rank":
        return `Score: ${getScore(match).toFixed(2)}, Left rank: ${String(match.leftRank + 1)}, Right rank: ${String(match.rightRank + 1)}`;
      case "rankOverall":
        return `Score: ${getScore(match).toFixed(2)}, Left rank: ${String(match.leftOverallRank + 1)}, Right rank: ${String(match.rightOverallRank + 1)}`;
    }
  }

  const sorted = useMemo(() => {
    if (!midpoint) return [];
    return [...midpoint.topMatches]
      .filter((m) => ![left, right].includes(m.title))
      .sort((a, b) => getScore(b) - getScore(a));
  }, [midpoint, strategy]);
  if (!sorted.length) return null;
  return (
    <div className="flex flex-col items-center w-full gap-2">
      <div className="flex flex-col justify-center">
        {sorted.slice(0, 10).map((result, i) => {
          const title = getHoverText(result);
          return (
            <div
              key={result.title + i}
              className="px-3 py-1 text-3xl"
              title={title}
            >
              {result.title}
            </div>
          );
        })}
      </div>
      <div className="">{strategyName(strategy)}</div>
    </div>
  );
}

function SearchFeelings() {
  const [text, setText] = useState("");
  return (
    <div className="flex items-center gap-4">
      <div className="flex flex-col items-center gap-4">
        <h2 className="text-2xl mb-4">Feelings Finder</h2>
        <Input
          type="text"
          placeholder="Hit Enter to search"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              setText(e.currentTarget.value);
              e.currentTarget.value = "";
            }
          }}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
        <BasicSearch namespace="feelings" text={text} />
      </div>
    </div>
  );
}

function BasicSearch({ namespace, text }: { namespace: string; text: string }) {
  const basicSearch = useAction(api.namespace.basicVectorSearch);
  const [basicResults, setBasicResults] = useState<
    FunctionReturnType<typeof api.namespace.basicVectorSearch>
  >([]);
  useEffect(() => {
    if (!text) return;
    basicSearch({ namespace, text }).then((results) => {
      setBasicResults(results);
    });
  }, [namespace, text]);
  return (
    <div className="flex flex-col items-center w-full gap-2">
      <div className="text-lg"> {text}</div>
      <div className="flex flex-col justify-center gap-2">
        {!!text.length &&
          basicResults.map((result, i) => (
            <div
              key={result.title + i}
              className="px-3 py-1 text-lg font-medium "
              title={`Score: ${result.score.toFixed(2)}`}
            >
              {i + 1}: {result.title}
            </div>
          ))}
      </div>
    </div>
  );
}

function DailyGame() {
  // TODO: get namespace from env variable, default to first namespace.
  const gameResult = useQuery(api.game.getDailyGame, {
    namespace: "feelings",
  });
  if (gameResult && !gameResult.ok) {
    return <div>Error: {gameResult.error}</div>;
  }
  if (!gameResult) {
    return <div>Loading...</div>;
  }
  return (
    <>
      <Authenticated>
        <div className="container">
          <Game {...gameResult?.value} />
        </div>
      </Authenticated>
      <Unauthenticated>
        <SignInForm />
      </Unauthenticated>
    </>
  );
}
