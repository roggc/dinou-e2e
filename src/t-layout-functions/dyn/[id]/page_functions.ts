export async function getProps(params: any) {
  return {
    pageMsg: `Page message for ${params?.id}`,
  };
}
