const axios = require("axios");
const express = require("express");
const app = express();
require("dotenv").config();
const url = require("url");
let client = require("prom-client");
axios.defaults.timeout = parseInt(process.env.AXIOS_TIMEOUT);
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
// Gauges
let probeSuccessGuage = new client.Gauge({
  name: "proxy_probe_kia",
  help: "status of proxy server",
});
let probeDurationGuage = new client.Gauge({
  name: "proxy_probe_ducration_seconds",
  help: "response time of proxy server",
});

async function scrapeWithHttpProxy(target, proxyHost, proxyPort, auth) {
  let httpsAgent = "";
  try {
    if (auth === null) {
      httpsAgent = new HttpsProxyAgent({ host: proxyHost, port: proxyPort });
    } else {
      let proxyAuth = `${auth.split(":")[0]}:${auth.split(":")[1]}`;
      httpsAgent = new HttpsProxyAgent({
        host: proxyHost,
        port: proxyPort,
        auth: proxyAuth,
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
    var options = {
      uri: target,
      agent: agent,
      headers: {
        "User-Agent": "Request-Promise",
      },
      time: true,
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

function timeout(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

//app
app.get("/probe", validator.query(querySchema), async (req, res) => {
  let queryTarget = req.query.target;
  let queryproxyURL = req.query.proxyURL;
  var q = url.parse(queryproxyURL, true);

  let queryProxyHost = q.hostname;
  let queryProxyPort = q.port;
  let queryProxyAuth = q.auth;

  if (q.protocol.split(":")[0] == "http") {
    const res = await scrapeWithHttpProxy(
      queryTarget,
      queryProxyHost,
      queryProxyPort,
      queryProxyAuth
    );
    probeSuccessGuage.set(res.proxy_probe_success);
    probeDurationGuage.set(res.proxy_probe_duration_seconds);
    // console.log(res);
  } else if (q.protocol.split(":")[0] == "socks") {
    const res = await scrapeWithSocksProxy(
      queryTarget,
      queryProxyHost,
      queryProxyPort
    );
    probeSuccessGuage.set(res.proxy_probe_success);
    probeDurationGuage.set(res.proxy_probe_duration_seconds);
    console.log(res);
    await timeout(10000);
  } else {
    return res.status(400).send("invalid proxy protocol found in proxyURL");
  }

  metrics = await client.register.metrics();
  // client.register.clear();
  return res.status(200).send(metrics);
});

app.listen(process.env.LISTEN_PORT, () =>
  console.log(
    "Server is running and metrics are exposed on http://URL:3000/metrics"
  )
);
