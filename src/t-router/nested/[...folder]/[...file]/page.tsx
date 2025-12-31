"use client";

export default function Page({ params }: any) {
  return (
    <div id="res">
      folder: {params.folder} file: {params.file}
    </div>
  );
}
