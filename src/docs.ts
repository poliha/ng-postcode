// The page a browser gets at `/`: Swagger UI over /openapi.json, so the mock can be explored and
// called from the page itself. Swagger UI loads from jsDelivr, pinned and integrity-checked, which
// keeps the package free of runtime dependencies.

const SWAGGER_UI_VERSION = '5.33.1'
const CDN = `https://cdn.jsdelivr.net/npm/swagger-ui-dist@${SWAGGER_UI_VERSION}`
const BUNDLE_SRI = 'sha384-ZPehFMQommnnuaZ4rpxgkgTT2DKFVp4hZC/7pLit+9Lek9T1YGSo23eHFbvNkXkw'
const CSS_SRI = 'sha384-Ov4/wv3j2bmct8cDc5X4ngJZohVPzEmc6uDPH8WeljUxO5vtoykvMEfbu9Vh6RaW'

export const docsPage = (): string => {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>NIPOST Postcode API mock (unofficial)</title>
  <meta name="description" content="An unofficial, open source mock of Nigeria's NIPOST Postcode API. Same paths and response shapes, mock data, no sign-up.">
  <link rel="icon" href="data:,">
  <link rel="stylesheet" href="${CDN}/swagger-ui.css" integrity="${CSS_SRI}" crossorigin="anonymous">
  <style>
    body { margin: 0; background: #fff; }
    .swagger-ui .topbar { display: none; }
  </style>
</head>
<body>
  <div id="swagger-ui">
    <noscript>
      <p>Unofficial mock of the NIPOST Postcode API. The spec is at <a href="/openapi.json">/openapi.json</a>;
      try <a href="/v1/lookup?code=LA-11-W06-TC-10&amp;level=3">a lookup</a>.
      Source: <a href="https://github.com/poliha/ng-postcode">github.com/poliha/ng-postcode</a>.</p>
    </noscript>
  </div>
  <script src="${CDN}/swagger-ui-bundle.js" integrity="${BUNDLE_SRI}" crossorigin="anonymous"></script>
  <script>
    window.ui = SwaggerUIBundle({
      url: '/openapi.json',
      dom_id: '#swagger-ui',
      deepLinking: true,
      tryItOutEnabled: true,
      docExpansion: 'list',
      defaultModelsExpandDepth: -1,
    })
  </script>
</body>
</html>
`
}
