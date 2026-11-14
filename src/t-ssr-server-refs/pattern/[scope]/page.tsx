"use client";

import {
  Suspense,
  use,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import defaultVaultCheckAction, {
  addPatternTask,
  boundFormStampAction,
  fetchPatternTasks,
  formStampAction,
  resetPatternTasks,
} from "../../actions/pattern-actions";
import CodeSnippetViewer from "../../components/code-snippet-viewer";
import {
  triggerScopeRefresh,
  useScopeRefreshKey,
} from "../../store/native-task-store";

function TasksSlot({ promise }: { promise: Promise<ReactNode> }) {
  return <>{use(promise)}</>;
}

export default function DinouPatternIsolationPage({
  params,
}: {
  params: { scope: string };
}) {
  const scope = params.scope;
  const refreshKey = useScopeRefreshKey(scope);

  // In-render initial Server Function call: Pass B defers this cleanly to client <Suspense> mount.
  const [tasksPromise, setTasksPromise] = useState<Promise<ReactNode>>(() =>
    fetchPatternTasks(scope)
  );
  const lastRefreshRef = useRef({ scope, refreshKey: 0 });

  useEffect(() => {
    if (
      lastRefreshRef.current.scope !== scope ||
      lastRefreshRef.current.refreshKey !== refreshKey
    ) {
      lastRefreshRef.current = { scope, refreshKey };
      setTasksPromise(fetchPatternTasks(scope));
    }
  }, [scope, refreshKey]);

  const [input, setInput] = useState("");
  const [unrelatedDraft, setUnrelatedDraft] = useState("");
  const [mutationNode, setMutationNode] = useState<ReactNode>(null);
  const [isMutating, setIsMutating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [errorDigest, setErrorDigest] = useState<string | null>(null);
  const [defaultActionResult, setDefaultActionResult] = useState("");

  const boundStampAction = boundFormStampAction.bind(null, scope);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMsg(null);
    setErrorDigest(null);
    setIsMutating(true);

    addPatternTask(scope, input)
      .then((node) => {
        setMutationNode(node);
        setInput("");
      })
      .catch((err: unknown) => {
        const typedErr = err as { message?: string; digest?: string };
        setErrorMsg(typedErr?.message || "Failed to add task.");
        setErrorDigest(
          typeof typedErr?.digest === "string" ? typedErr.digest : "NONE"
        );
      })
      .finally(() => {
        setIsMutating(false);
      });
  }

  async function handleReset() {
    setErrorMsg(null);
    setErrorDigest(null);
    setMutationNode(null);
    await resetPatternTasks(scope);
    triggerScopeRefresh(scope);
  }

  return (
    <main data-testid="ssr-server-refs-pattern-page">
      <h1 data-testid="pattern-heading">{`The Dinou Pattern (${scope})`}</h1>

      {/* Unrelated local client state that must survive mutations & validation errors */}
      <label>
        Draft scratchpad:
        <input
          type="text"
          data-testid="unrelated-draft-input"
          value={unrelatedDraft}
          onChange={(e) => setUnrelatedDraft(e.target.value)}
          placeholder="Unrelated local draft..."
        />
      </label>

      <form onSubmit={handleSubmit} data-testid="pattern-task-form">
        <input
          type="text"
          data-testid="task-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Enter a task (min 3 chars)..."
          disabled={isMutating}
        />
        <button type="submit" data-testid="add-task-btn" disabled={isMutating}>
          {isMutating ? "Adding..." : "Add Task"}
        </button>
        <button
          type="button"
          data-testid="reset-tasks-btn"
          onClick={handleReset}
          disabled={isMutating}
        >
          Reset
        </button>
      </form>

      {errorMsg && (
        <div data-testid="error-box">
          <p role="alert" data-testid="error-banner">
            {errorMsg}
          </p>
          <span data-testid="error-digest">{errorDigest}</span>
        </div>
      )}

      <div data-testid="mutation-slot">{mutationNode}</div>

      <section data-testid="tasks-section">
        <Suspense
          fallback={<p data-testid="tasks-fallback">Loading tasks...</p>}
        >
          <TasksSlot promise={tasksPromise} />
        </Suspense>
      </section>

      <section data-testid="default-export-action-section">
        <button
          type="button"
          data-testid="default-action-btn"
          onClick={async () => {
            const res = await defaultVaultCheckAction(scope, "ping");
            setDefaultActionResult(res);
          }}
        >
          Verify Default Server Action
        </button>
        <p data-testid="default-action-result">{defaultActionResult}</p>
      </section>

      {/* Canonical <form action={...}> & bound .bind() forms inspected in raw SSR/SSG HTML */}
      <form data-testid="canonical-direct-form" action={formStampAction}>
        <input type="hidden" name="stampTag" value="direct" />
      </form>
      <form data-testid="canonical-bound-form" action={boundStampAction}>
        <input type="hidden" name="stampTag" value="bound" />
      </form>

      <CodeSnippetViewer />
    </main>
  );
}

