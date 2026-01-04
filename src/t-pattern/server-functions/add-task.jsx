"use server";
import AddTask from "../components/add-task";
import { tasks } from "./tasks";

export async function addTask(text) {
  tasks.push(text);

  // 🪄 Magic: Return the updater to run logic on the client
  return <AddTask />;
}
