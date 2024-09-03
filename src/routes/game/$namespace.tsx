import { api } from "@convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import {
  useAction,
  useConvex,
  useMutation,
  usePaginatedQuery,
  useQuery,
} from "convex/react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useEffect, useMemo, useState } from "react";
import { toast } from "@/components/ui/use-toast";
import { FunctionReturnType } from "convex/server";
import type { Strategy } from "@convex/namespace";
import { Doc } from "@convex/_generated/dataModel";
import { Flipboard } from "@/components/Flipboard";
import {
  CheckCheck,
  Coins,
  CornerDownRight,
  Earth,
  LetterText,
  Trophy,
} from "lucide-react";
import { Flipped, Flipper } from "react-flip-toolkit";

export const Route = createFileRoute("/game/$namespace")({
  component: NamespaceGame,
});

const fn = api.namespace;

function NamespaceGame() {
  const { namespace } = Route.useParams();
  const { name, description, isEmpty } =
    useQuery(fn.getNamespace, { namespace }) || {};
  const convex = useConvex();
  const midpoints = usePaginatedQuery(
    fn.listMidpoints,
    { namespace },
    { initialNumItems: 10 },
  );
  const [words, setWords] = useState({
    left: "happy",
    right: "surprised",
    guess: "",
  });
  useEffect(() => {
    if (midpoints.results.length === 0) return;
    if (words.left || words.right) return;
    setWords({
      left: midpoints.results[0].left,
      right: midpoints.results[0].right,
      guess: "",
    });
  }, [words.left, words.right, midpoints.results[0]]);

  const [guessResults, setGuessResults] = useState<
    FunctionReturnType<typeof fn.makeGuess>[]
  >([]);

  const [strategy, setStrategy] = useState<Strategy>("rank");

  const titles = [
    "Matching Madness",
    "Mixed Matches",
    "Mashed Meanings",
    "Word Fusion Frenzy",
    "Semantic Shuffle",
    "Lexical Labyrinth",
    "Verbal Vortex",
    "Synonym Symphony",
    "Wordplay Wizardry",
    "Linguistic Limbo",
    "Phrasal Fusion",
    "Vocabulary Vortex",
    "Diction Dimension",
    "Terminology Tango",
    "Etymological Enigma",
  ];
  const [data, setData] = useState(titles[0]);
  const [guess, setGuess] = useState("");
  const [guessing, setGuessing] = useState(false);
  const shuffleList = () => {
    setData(titles[Math.floor(Math.random() * titles.length)]);
  };
  const [circleSwap, setCircleSwap] = useState(false);
  const [randomize, setRandomize] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setCircleSwap(!circleSwap), 5000);
    return () => clearTimeout(timer);
  }, [circleSwap]);

  const makeGuess = () => {
    if (guessResults.some((r) => r.guess === guess)) {
      toast({ title: "Guess already made" });
      return;
    }
    convex
      .action(fn.makeGuess, {
        ...words,
        guess,
        namespace,
        strategy,
      })
      .then((results) => setGuessResults((arr) => [...arr, results]))
      .catch((e) => {
        e.currentTarget.value = guess;
        toast({
          title: "Error making guess",
          description: e.message,
        });
      });
    setWords((words) => ({ ...words, guess }));
    setGuess("");

    setRandomize(false);

    setTimeout(() => setRandomize(true), 3000);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen h-full overflow-scroll bg-background text-foreground">
      <main className="flex flex-col items-start justify-center w-full max-w-5xl gap-4 px-6 py-8">
        <div className="flex items-start gap-4">
          <div className="flex flex-col">
            <button onClick={shuffleList}>shuffle</button>
            <div className="text-6xl text-yellow-400">
              <Flipper flipKey={data}>
                {data.split("").map((char, i) => {
                  if (char === " ") {
                    return <span key={char + i}>&nbsp;</span>;
                  }
                  return (
                    <Flipped key={char + i} flipId={char}>
                      <div className="text-yellow-400 inline-block">
                        {char || ` `}
                      </div>
                    </Flipped>
                  );
                })}
              </Flipper>
            </div>
            <div className="text-4xl">{description}</div>
            <div className="absolute top-32 left-3/4">
              <Flipper flipKey={circleSwap}>
                <div className="relative w-64 h-32 mt-4">
                  <Flipped flipId="circle1">
                    <div
                      className="absolute w-24 h-24 rounded-full bg-blue-500 opacity-50 transition-all duration-500 ease-in-out"
                      style={{
                        left: circleSwap ? "0" : "40px",
                        top: "4px",
                      }}
                    ></div>
                  </Flipped>
                  <Flipped flipId="circle2">
                    <div
                      className="absolute w-24 h-24 rounded-full bg-red-500 opacity-50 transition-all duration-500 ease-in-out"
                      style={{
                        left: circleSwap ? "40px" : "0px",
                        top: "4px",
                      }}
                    ></div>
                  </Flipped>
                </div>
              </Flipper>
            </div>
            <div className="flex flex-col gap-1 py-12">
              <div className="text-3xl text-gray-400 uppercase">
                How to play
              </div>
              <div className="text-3xl">
                Guess the word that best represents the combination of two
                words. How many words can you guess before you run out of coins?
              </div>
            </div>
          </div>
        </div>
        <div className="text-3xl text-yellow-400 uppercase w-full">
          <div className="flex flex-row items-center gap-2 justify-between">
            <span>
              {new Date().toLocaleDateString("en-US", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}{" "}
            </span>
            <span className="text-gray-700">
              new game starts in{" "}
              {(() => {
                const now = new Date();
                const midnight = new Date(
                  now.getFullYear(),
                  now.getMonth(),
                  now.getDate() + 1,
                );
                const diff = midnight.getTime() - now.getTime();
                const hours = Math.floor(diff / (1000 * 60 * 60));
                const minutes = Math.floor(
                  (diff % (1000 * 60 * 60)) / (1000 * 60),
                );
                return `${hours} hours and ${minutes} minutes`;
              })()}
            </span>
          </div>
        </div>
        <div className="flex flex-row gap-4 w-full">
          <div className="bg-slate-900 flex flex-col gap-6 py-6 px-4 w-3/4">
            <div className="text-2xl text-slate-600 uppercase">Your stats</div>
            <div className="flex flex-row justify-start items-start">
              <div className="text-5xl  text-yellow-400 flex flex-col items-start gap-1 w-1/3">
                <div className="flex flex-row items-end gap-4">
                  <span className="rounded-sm text-slate-900 bg-yellow-400 p-1">
                    <Earth size={36} strokeWidth={2} />
                  </span>{" "}
                  <div className="text-5xl font-bold-TOM">#1</div>
                </div>
                <div className="flex flex-row place-self-start">
                  <div className="text-3xl text-white">your rank</div>
                </div>
              </div>
              <div className="text-5xl  text-yellow-400 flex flex-col items-start gap-1 w-1/3">
                <div className="flex flex-row items-start justify-start gap-4">
                  <span className="rounded-sm text-slate-900 bg-yellow-400 p-1">
                    <Coins size={36} strokeWidth={2} />
                  </span>{" "}
                  <div className="text-5xl font-bold-TOM">100</div>
                </div>
                <div className="flex flex-row place-self-start">
                  <div className="text-3xl text-white">coins</div>
                </div>
              </div>
              <div className="text-5xl  text-yellow-400 flex flex-col items-start gap-1 w-1/3">
                <div className="flex flex-row items-end gap-4">
                  <span className="rounded-sm text-slate-900 bg-yellow-400 p-1">
                    <LetterText size={36} strokeWidth={2} />
                  </span>{" "}
                  <div className="text-5xl font-bold-TOM">0</div>
                </div>
                <div className="flex flex-row place-self-start">
                  <div className="text-3xl text-white">words</div>
                </div>
              </div>
            </div>
          </div>
          <div className="bg-slate-900 flex flex-row py-6 px-4 w-1/4">
            <div className="flex flex-col gap-6">
              <div className="text-2xl text-slate-600 uppercase">Level</div>
              <div className="flex flex-row justify-start items-start">
                <div className="text-5xl  text-yellow-400 flex flex-col items-start gap-1">
                  <div className="flex flex-row items-end gap-4">
                    <svg width="140" height="75" viewBox="0 0 140 75">
                      <circle
                        cx="40"
                        cy="35"
                        r="35"
                        fill="#FFD700"
                        fillOpacity="1"
                      />
                      <circle
                        cx="80"
                        cy="35"
                        r="35"
                        fill="#4169E1"
                        fillOpacity="0.7"
                      />
                    </svg>
                  </div>
                  <div className="flex flex-row place-self-start">
                    <div className="text-3xl text-white">Beginner</div>
                  </div>
                </div>
              </div>
            </div>
            {/* <div className="flex flex-col gap-6 w-full justify-center items-center">
              <div className="flex flex-col items-center justify-between w-full h-4/5">
                <svg width="40" height="25" viewBox="0 0 40 25">
                  <circle
                    cx="12"
                    cy="12"
                    r="12"
                    fill="#FFD700"
                    fillOpacity="1"
                  />
                  <circle
                    cx="28"
                    cy="12"
                    r="12"
                    fill="#4169E1"
                    fillOpacity="0.7"
                  />
                </svg>
                <svg width="36" height="25" viewBox="0 0 36 25">
                  <circle
                    cx="12"
                    cy="12"
                    r="12"
                    fill="#FFD700"
                    fillOpacity="1"
                  />
                  <circle
                    cx="24"
                    cy="12"
                    r="12"
                    fill="#4169E1"
                    fillOpacity="0.7"
                  />
                </svg>
                <svg width="30" height="25" viewBox="0 0 30 25">
                  <circle
                    cx="12"
                    cy="12"
                    r="12"
                    fill="#FFD700"
                    fillOpacity="1"
                  />
                  <circle
                    cx="18"
                    cy="12"
                    r="12"
                    fill="#4169E1"
                    fillOpacity="0.7"
                  />
                </svg>
              </div>
            </div> */}
          </div>
        </div>

        <div className="flex flex-row gap-4 w-full">
          <div className="w-1/2">
            <div className="bg-slate-900 flex flex-col gap-6 py-6 px-4">
              <div className="text-2xl text-slate-600 uppercase">
                Let's Play
              </div>
              <div className="text-5xl text-yellow-400 flex flex-row items-end gap-4 pb-4">
                <span className="rounded-sm text-slate-900 bg-yellow-400 p-1">
                  <Coins size={36} strokeWidth={2} />
                </span>{" "}
                Game #1
              </div>
              {!isEmpty && (
                <div className="flex flex-col items-start w-full gap-2 font-bold">
                  <div className="flex flex-col items-start gap-4">
                    <div className="text-5xl">{words.left}</div>
                    <div className="text-5xl opacity-30">+</div>
                    <div className="text-5xl">{words.right}</div>
                    <div className="text-5xl opacity-30">=</div>

                    <Input
                      type="text"
                      placeholder="???"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          makeGuess();
                        }
                      }}
                      value={guess}
                      onChange={(e) => setGuess(e.currentTarget.value)}
                      className="w-full h-[100px] rounded-md border-0 bg-background px-3 py-2 text-6xl ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 text-yellow-400"
                    />
                    <button
                      className=" bg-white bg-opacity-10 text-4xl py-2 px-4 rounded-md w-full flex flex-row justify-center items-center gap-2"
                      onClick={() => {
                        makeGuess();
                      }}
                    >
                      <span className="text-yellow-400">
                        <CornerDownRight size={36} strokeWidth={2} />
                      </span>{" "}
                      Place Your Guess
                    </button>
                    <div className="flex flex-col justify-center gap-2">
                      {[...guessResults]
                        .sort((a, b) =>
                          strategy === "lxr"
                            ? b.lxrScore - a.lxrScore
                            : b.score - a.score,
                        )
                        .slice(0, 10)
                        .map((guess, i) => (
                          <div
                            key={guess.guess + i}
                            className="px-3 py-1 text-sm font-medium rounded-md bg-muted text-muted-foreground"
                          >
                            {f(guess.leftScore)} ⬅️ {guess.guess}: {guess.rank}(
                            {f(guess.score)}) ➡️ {f(guess.rightScore)}
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="w-1/2 flex flex-col gap-4">
            <div className="bg-slate-900 flex flex-col gap-6 py-6 px-6">
              <div className="text-2xl text-slate-600 uppercase">
                Matching Words
              </div>
              <div className="text-5xl font-bold-TOM text-yellow-400 flex flex-row items-end gap-4">
                <span className="rounded-sm text-slate-900 bg-yellow-400 p-1">
                  <Trophy size={36} strokeWidth={2} />
                </span>{" "}
                TOP 10
              </div>
              <div className="flex flex-col gap-3 text-xl text-yellow-400">
                <div className="flex flex-row gap-3 text-xl text-yellow-400">
                  <div className="w-[45px]">RANK</div>
                  <div className="w-[263px]">WORD</div>
                  <div className="w-[87px]">PRICE</div>
                </div>

                <Midpoint
                  namespace={namespace}
                  left={words.left}
                  right={words.right}
                  strategy={strategy}
                  randomize={randomize}
                />
              </div>

              <div className="flex flex-row gap-2 mt-4">
                <button className="bg-white bg-opacity-10 py-2 px-4 rounded-md text-xl">
                  Hint (10 coins)
                </button>
                <button className="bg-white bg-opacity-10 py-2 px-4 rounded-md text-xl">
                  Reveal & Skip (25 coins)
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function Words({ namespace }: { namespace: string }) {
  const texts = usePaginatedQuery(
    fn.paginateText,
    {
      namespace,
    },
    { initialNumItems: 10 },
  );
  return (
    <div className="flex flex-col items-center gap-2 ">
      <span className="text-3xl font-bold-TOM">Words</span>
      {texts.results.map((text) => (
        <div key={text._id} className="flex items-center gap-4">
          <div className="flex-1 text-sm font-medium">
            {text.title} {text.text === text.title ? null : `(${text.text})`}
          </div>
        </div>
      ))}
      {texts.status === "CanLoadMore" && (
        <Button onClick={() => texts.loadMore(100)}>Load more</Button>
      )}
    </div>
  );
}

function checkString(input: unknown): string {
  if (typeof input !== "string") {
    throw new Error("Must be a string");
  }
  return input;
}

function checkObject(input: unknown): { title: string; text: string } {
  if (!input || typeof input !== "object") {
    throw new Error(`Must be an object: ${input}`);
  }
  if ("title" in input && "text" in input) {
    return { title: checkString(input.title), text: checkString(input.text) };
  }
  throw new Error(`Must have title and text: ${input}`);
}

function parseText(input: string): { title: string; text: string }[] {
  try {
    const results = JSON.parse(input);
    if (!Array.isArray(results)) {
      throw new Error("Must be an array");
    }
    if (typeof results[0] === "string") {
      return results.map(checkString).map((text) => ({ title: text, text }));
    } else {
      return results.map(checkObject);
    }
  } catch (e) {
    const trimmed = input.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      toast({
        title: "Error adding text",
        description:
          (e as string) +
          `You can add a JSON array of strings or objects like {"title": "foo", "text": "bar"}[] or lines of text separated by newlines`,
      });
      throw e;
    }
  }
  const lines = input
    .split("\n")
    .map((line) => {
      let ret = line;
      if (ret.startsWith('"')) ret = ret.slice(1);
      if (ret.endsWith(",")) ret = ret.slice(0, -1);
      if (ret.endsWith('"')) ret = ret.slice(0, -1);
      return ret;
    })
    .filter(Boolean);
  if (lines.length < 2) {
    toast({
      title: "Error adding text",
      description: "No lines found in input",
    });
    throw new Error("No lines found");
  }
  return lines.map((text) => ({ title: text, text }));
}

function BasicSearch({ namespace, text }: { namespace: string; text: string }) {
  const basicSearch = useAction(fn.basicVectorSearch);
  const [basicResults, setBasicResults] = useState<
    FunctionReturnType<typeof fn.basicVectorSearch>
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
              className="px-3 py-1 text-sm font-medium rounded-md bg-muted text-muted-foreground"
            >
              {result.title} - {f(result.score)}
            </div>
          ))}
      </div>
    </div>
  );
}

function f(num: number | undefined) {
  if (num === undefined) return "???";
  return num.toPrecision(2);
}

function Midpoint({
  namespace,
  left,
  right,
  strategy,
  randomize,
}: {
  namespace: string;
  right: string;
  left: string;
  strategy: Strategy;
  randomize: boolean;
}) {
  const search = useAction(fn.midpointSearch);
  const makeGame = useMutation(fn.makeGame);
  const [midpoint, setMidpoint] = useState<Doc<"midpoints">>();
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
  const getLR = (
    match: Doc<"midpoints">["topMatches"][0],
  ): [number, number] => {
    switch (strategy) {
      case "lxr":
        return [match.leftScore, match.rightScore];
      case "midpoint":
        return [match.leftScore, match.rightScore];
      case "rank":
        return [match.leftRank, match.rightRank];
      case "rankOverall":
        return [match.leftOverallRank, match.rightOverallRank];
    }
  };

  const sorted = useMemo(() => {
    if (!midpoint) return [];
    return [...midpoint.topMatches].sort((a, b) => getScore(b) - getScore(a));
  }, [midpoint, strategy]);
  useEffect(() => {
    if (!left || !right) return;
    search({ namespace, left, right }).then((results) => {
      setMidpoint(results);
    });
  }, [namespace, left, right]);
  return (
    <>
      {sorted.slice(0, 10).map((result, i) => {
        //const [left, right] = getLR(result);
        return (
          <Flipboard
            key={result.title + i}
            rank={i + 1}
            value={result.title}
            points={i * 10}
            obfuscate={false}
            randomize={randomize}
          />
        );
      })}
    </>
  );
}
