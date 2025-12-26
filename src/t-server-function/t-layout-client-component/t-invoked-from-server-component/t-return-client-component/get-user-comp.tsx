"use client";

export default function GetUserComp({ user }: { user?: string }) {
  return <div>{user && <div>{`Hello ${user}`}</div>}</div>;
}
