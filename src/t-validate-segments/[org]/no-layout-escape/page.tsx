export default function ValidateSegmentsNoLayoutPage({
  params,
}: {
  params: { org: string };
}) {
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <title>No Layout Escape</title>
      </head>
      <body>
        <div data-testid="vs-no-layout-page">NoLayout Org: {params?.org}</div>
      </body>
    </html>
  );
}

