const axios = require('axios');
const express = require('express');
const app = express();
require('dotenv').config();
const client = require('prom-client');
const url = require('url') ;
axios.defaults.timeout = parseInt(process.env.AXIOS_TIMEOUT);
// httpProxy
const HttpsProxyAgent = require("https-proxy-agent");
const https = require('https');
// socksProxy
const SocksProxyAgent = require('socks-proxy-agent');
var rp = require('request-promise');
// querystrings validation
const Joi = require('joi');
const validator = require('express-joi-validation').createValidator({});
 
const querySchema = Joi.object({
    target: Joi.string().required(),
    proxyURL: Joi.string().required()
});
// Gauges
httpProxyUpGauge = new client.Gauge({ name: 'http_proxy_up', help: 'status of http proxy server'});
httpProxyResponseTimeGauge = new client.Gauge({ name: 'http_proxy_response_time', help: 'response time of http proxy server'});
httpProxyLastUpdateGauge = new client.Gauge({ name: 'http_proxy_last_update_seconds', help: 'http_proxy_last_update_seconds'});
socksProxyUpGauge = new client.Gauge({ name: 'socks_proxy_up', help: 'status of socks proxy server'});
socksProxyResponseTimeGauge = new client.Gauge({ name: 'socks_proxy_response_time', help: 'response time of socks proxy server'});
socksProxyLastUpdateGauge = new client.Gauge({ name: 'socks_proxy_last_update_seconds', help: 'socks_proxy_last_update_seconds'});


async function updateHttpProxyMetrics(target,proxyHost,proxyPort,auth) {
    let httpsAgent='';
    try {
        if(auth === null){
            httpsAgent = new HttpsProxyAgent({host: proxyHost, port: proxyPort});
        }else{
            let proxyAuth = `${auth.split(':')[0]}:${auth.split(':')[1]}`;
            httpsAgent = new HttpsProxyAgent({host: proxyHost, port: proxyPort,auth: proxyAuth});
        }
        console.log('starting sending request through proxy');
        start = new Date();
        const proxyRes = await axios.get(target, {httpsAgent});
        var end = new Date() - start;

        httpProxyUpGauge.set(1);
        httpProxyLastUpdateGauge.set(Math.floor(Date.now() / 1000));
        httpProxyResponseTimeGauge.set(end);
        console.log('finished sending request through http proxy');
        console.log('///////////////////////////////////////////');

    } catch(e) {
        console.log(e);
        console.log('error on http proxy connection');
        httpProxyUpGauge.set(0);
    }
}



async function updateSocksProxyMetrics(target,proxyHost,proxyPort) {
    try {
        var proxy = `socks5://${proxyHost}:${proxyPort}`;
        var agent = new SocksProxyAgent(proxy);
        var options = {
            uri: target,
            agent: agent,
            headers: {
                'User-Agent': 'Request-Promise'
            },
            time : true
        };
        console.log('starting sending request through socks proxy');
        var start = new Date();
        const socksProxyRes = await rp(options);
        var end = new Date() - start;
        
        socksProxyUpGauge.set(1);
        socksProxyLastUpdateGauge.set(Math.floor(Date.now() / 1000));
        socksProxyResponseTimeGauge.set(end);
        console.log('finished sending request through socks proxy');
        console.log('///////////////////////////////////////////');

    } catch(e) {
        console.log(e);
        console.log('error on socks proxy connection');
        socksProxyUpGauge.set(0);
    }
}





//app
app.get('/probe', validator.query(querySchema), async (req, res) => {
    let queryTarget = req.query.target;
    let queryproxyURL = req.query.proxyURL;
    var  q = url.parse(queryproxyURL,true);
    
    let queryProxyHost = q.hostname;
    let queryProxyPort = q.port;
    let queryProxyAuth = q.auth;
    

    if(q.protocol.split(':')[0] == 'http'){
        await updateHttpProxyMetrics(queryTarget,queryProxyHost,queryProxyPort,queryProxyAuth);
    }else if(q.protocol.split(':')[0] == 'socks'){
        await updateSocksProxyMetrics(queryTarget,queryProxyHost,queryProxyPort);
    }else{
        return res.status(400).send('invalde proxy protocol found in proxyURL');
    }

    metrics = await client.register.metrics();
    return res.status(200).send(metrics);
});

app.listen(process.env.LISTEN_PORT, () => console.log('Server is running and metrics are exposed on http://URL:3000/metrics'));
