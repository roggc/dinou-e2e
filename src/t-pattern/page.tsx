"use client";
import Suspense from "react-enhanced-suspense";
import { useAtomValue, useAtom } from "@/atoms";
import { addTask } from "./server-functions/add-task";
import { tasksList } from "./server-functions/tasks-list";
import { useState } from "react";

export default function Page() {
  const tasksListKey = useAtomValue("tasksListKey");
  const [isAddTask, setIsAddTask] = useAtom("isAddTask");
  const [text, setText] = useState("");

  return (
    <div>
      {/* The Mutation */}
      <input type="text" onChange={(e) => setText(e.target.value)} />
      <button onClick={() => setIsAddTask(true)}>Add Task</button>
      {isAddTask && (
        <Suspense fallback="adding task..." resourceId="add-task">
          {() => addTask(text)}
        </Suspense>
      )}

      {/* The Reactive List */}
      {/* Changing resourceId forces Suspense to re-fetch TaskList */}
      <Suspense
        fallback={<div>Loading...</div>}
        resourceId={`tasks-list-${tasksListKey}`}
      >
        {() => tasksList()}
      </Suspense>
    </div>
  );
}
