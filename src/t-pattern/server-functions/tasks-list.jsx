"use server";

import { tasks } from "./tasks";
import TasksList from "../components/tasks-list";

export async function tasksList() {
  return <TasksList tasks={tasks} />;
}
