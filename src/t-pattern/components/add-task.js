"use client";
import { useEffect } from "react";
import { useSetAtom } from "@/atoms";

export default function AddTask() {
  const setTasksListKey = useSetAtom("tasksListKey");
  const setIsAddTask = useSetAtom("isAddTask");

  useEffect(() => {
    // Update the key to force a re-fetch
    setTasksListKey((k) => k + 1);
    setIsAddTask(false);
  }, []);

  return null; // It renders nothing visually
}
