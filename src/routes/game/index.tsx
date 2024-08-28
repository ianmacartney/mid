import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/use-toast";
import { api } from "@convex/_generated/api";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";

export const Route = createFileRoute("/game/")({
  component: Game,
});

function Game() {
  const namespaces = useQuery(api.namespace.listNamespaces) || [];
  const upsertNamespace = useMutation(api.namespace.upsertNamespace);
  return (
    <div className="flex flex-col gap-2 items-center min-h-full overflow-scroll bg-background text-foreground">
      <h2>Namespaces</h2>
      {namespaces.map((namespace) => (
        <Link key={namespace._id} to={`/author/${namespace.slug}`}>
          <Button>
            <>
              {namespace.name} ({namespace.slug}) -{" "}
              <i>{namespace.public ? "public" : "private"}</i>
            </>
          </Button>
        </Link>
      ))}
      <form>
        <Input
          type="text"
          placeholder="Create"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const name = e.currentTarget.value;
              const slug = name.toLowerCase().replace(/\s/g, "-");
              e.preventDefault();
              e.currentTarget.value = "";
              upsertNamespace({
                name,
                slug,
                description: "",
                public: false,
              }).catch((err) => {
                console.log(e);
                toast({
                  title: "Failed to create namespace",
                  description: err.message,
                });
                if (!(e.target as HTMLInputElement).value)
                  (e.target as HTMLInputElement).value = name;
              });
            }
          }}
          className="max-w-[200px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
      </form>
    </div>
  );
}
