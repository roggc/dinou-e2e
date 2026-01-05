const getJSX = require("./get-jsx.js");
const getSSGJSX = require("./get-ssg-jsx.js");
const { getJSXJSON } = require("./jsx-json.js");

async function getSSGJSXOrJSX(
  reqPath,
  query,
  cookies = {},
  isDevelopment = false
) {
  const isNotFound = null;
  const result =
    Object.keys(query).length || isDevelopment || Object.keys(cookies).length
      ? await getJSX(reqPath, query, cookies, isNotFound, isDevelopment)
      : (await getSSGJSX(getJSXJSON(reqPath))) ??
        (await getJSX(reqPath, query, cookies, isNotFound, isDevelopment));
  return result;
}

module.exports = getSSGJSXOrJSX;
