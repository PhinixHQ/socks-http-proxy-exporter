const axios = require("axios");
const express = require("express");
const app = express();
require("dotenv").config();
const url = require("url");
const client = require("prom-client");
client.collectDefaultMetrics();

// timeouts
axios.defaults.timeout = parseInt(process.env.AXIOS_TIMEOUT);
httpProxyTimeout = parseInt(process.env.HTTP_PROXY_TIMEOUT);
socksProxyTimeout = parseInt(process.env.SOCKS_PROXY_TIMEOUT);
// httpProxy
const HttpsProxyAgent = require("https-proxy-agent");
const https = require("https");
// socksProxy
const SocksProxyAgent = require("socks-proxy-agent");
var rp = require("request-promise");  
// querystrings validation
const Joi = require("joi");
const validator = require("express-joi-validation").createValidator({});

const querySchema = Joi.object({
  target: Joi.string().required(),
  proxyURL: Joi.string().required(),
});



//////////////////////
async function scrapeWithHttpProxy(target, proxyHost, proxyPort, auth) {
  let httpsAgent = "";
  try {
    if (auth === null) {
      httpsAgent = new HttpsProxyAgent({ host: proxyHost, port: proxyPort , timeout: httpProxyTimeout});
    } else {
      let proxyAuth = `${auth.split(":")[0]}:${auth.split(":")[1]}`;
      httpsAgent = new HttpsProxyAgent({
        host: proxyHost,
        port: proxyPort,
        auth: proxyAuth,
        timeout: httpProxyTimeout
      });
    }
    console.log("starting sending request through proxy");
    start = new Date();
    const proxyRes = await axios.get(target, { httpsAgent });
    var duration = new Date() - start;
    console.log("finished sending request through http proxy");
    console.log("///////////////////////////////////////////");
    return { proxy_probe_success: 1, proxy_probe_duration_seconds: duration };
  } catch (e) {
    console.log(e);
    console.log("error on http proxy connection");
    return { proxy_probe_success: 0, proxy_probe_duration_seconds: 0 };
  }
}

async function scrapeWithSocksProxy(target, proxyHost, proxyPort) {
  try {
    var proxy = `socks5://${proxyHost}:${proxyPort}`;
    var agent = new SocksProxyAgent(proxy);
    agent.timeout= socksProxyTimeout;
    var options = {
      uri: target,
      agent: agent,
      headers: {
        "User-Agent": "Request-Promise",
      }
    };
    console.log("starting sending request through socks proxy");
    var start = new Date();
    const socksProxyRes = await rp(options);
    var duration = new Date() - start;

    console.log("finished sending request through socks proxy");
    console.log("///////////////////////////////////////////");
    return { proxy_probe_success: 1, proxy_probe_duration_seconds: duration };
  } catch (e) {
    console.log(e);
    console.log("error on socks proxy connection");
    return { proxy_probe_success: 0, proxy_probe_duration_seconds: 0 };
  }
}


//app
app.get("/probe", validator.query(querySchema), async (request, response) => {
  let queryTarget = request.query.target;
  let queryproxyURL = request.query.proxyURL;
  var q = url.parse(queryproxyURL, true);

  let queryProxyHost = q.hostname;
  let queryProxyPort = q.port;
  let queryProxyAuth = q.auth;

  let registry = new client.Registry();
  let probeSuccessGuage = new client.Gauge({
    name: "proxy_probe_success",
    help: "whether probe was successful or not",
    registers: [registry]
  });
  let probeDurationGuage = new client.Gauge({
    name: "proxy_probe_ducration_seconds",
    help: "duration of probe using the proxy",
    registers: [registry]
  });

  result = { proxy_probe_success: 0, proxy_probe_duration_seconds: 0 }
  if (q.protocol.split(":")[0] == "http") {
    result = await scrapeWithHttpProxy(
      queryTarget,
      queryProxyHost,
      queryProxyPort,
      queryProxyAuth
    );

  } else if (q.protocol.split(":")[0] == "socks") {
    result = await scrapeWithSocksProxy(
      queryTarget,
      queryProxyHost,
      queryProxyPort
    );
  } else {
    return response.status(400).send("invalid proxy protocol found in proxyURL");
  }

  probeSuccessGuage.set(result.proxy_probe_success);
  probeDurationGuage.set(result.proxy_probe_duration_seconds);

  return response.status(200).send(await registry.metrics());
});

app.get("/metrics", async (request, response) => {
  return response.status(200).send(await client.register.metrics());
});

app.listen(process.env.LISTEN_PORT, () =>
  console.log(
    `Server is running and metrics are exposed on http://:${process.env.LISTEN_PORT}/metrics`
  )
);
