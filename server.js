const child_process = require('child_process');
const express = require('express');
const cors = require('cors');
const request = require('request');
const http = require('http');
const WebSocketServer = require('ws').Server;

const app = express();
app.use(cors());

app.get('/api/:url', (req, res) => {
	console.log(decodeURIComponent(req.params.url));
	request(decodeURIComponent(req.params.url)).pipe(res);
});

const server = http.createServer(app).listen(3000, () => {
	console.log('Listening...');
});

app.use(express.static(__dirname + '/www'));

const wss = new WebSocketServer({
	server,
});

wss.on('connection', (ws, req) => {
	let match;
	if (!(match = req.url.match(/^\/rtmp\/(.*)$/))) {
		ws.terminate();
		return;
	}
	const rtmp_url = decodeURIComponent(match[1]);
	console.log('Target RTMP Url: ', rtmp_url);
	const ffmpeg = child_process.spawn('ffmpeg', [
		'-f', 'lavfi', '-i', 'anullsrc',
		'-i', '-',
		'-shortest',
		'-vcodec', 'copy',
		'-acodec', 'aac',
		'-f', 'flv',
		rtmp_url,
	]);
	ffmpeg.on('close', (code, signal) => {
		console.log('FFmpeg child process closed, code ' + code + ', signal ' + signal);
		ws.terminate();
	});
	ffmpeg.stdin.on('error', e => {
		console.log('FFmpeg stdin error: ', e);
	});
	ffmpeg.stderr.on('data', data => {
		console.log('FFmpeg stderr: ', data.toString());
	})
	ws.on('message', msg => {
		console.log('DATA', msg);
		ffmpeg.stdin.write(msg);
	});
	ws.on('close', e => {
		ffmpeg.kill('SIGINT');
	});
});
