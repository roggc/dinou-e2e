import React from "react";

export default function NoIsgChildPostPage({ params }: any) {
  return (
    <div id="no-isg-post-page">
      ID: {params?.id} | Post: {params?.postId}
    </div>
  );
}

