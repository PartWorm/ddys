function on_frame() {
	window.requestAnimationFrame(on_frame);
	ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height);
	return;
}

let canvas;
let ctx;

const API_KEY = '';
const CLIENT_ID = '';

const KEY = '';
const STREAM_URL = ``;

const x = 0;

function authenticate() {
	return gapi.auth2.getAuthInstance()
		.signIn({ scope: 'https://www.googleapis.com/auth/youtube.readonly' })
		.then(
			() => { console.log('Sign-in successful'); },
			err => { console.error('Error signing in', err); },
		);
}

function load_client() {
	gapi.client.setApiKey(API_KEY);
	return gapi.client.load('https://www.googleapis.com/discovery/v1/apis/youtube/v3/rest')
		.then(
			() => { console.log('GAPI client loaded for API'); },
			err => { console.error('Error loading GAPI client for API', err); }
		);
}

function fetch_stream_info(stream_id) {
	return gapi.client.youtube.liveBroadcasts.list({
		'part': ['snippet'],
		'id': [stream_id],
	})
	.then(
		undefined,
		err => {
			console.error('fetch_stream_info error', err);
		},
	);
}

function fetch_live_chat_list(live_chat_id, page_token) {
	return gapi.client.youtube.liveChatMessages.list({
		'liveChatId': live_chat_id,
		'part': ['snippet'],
		'pageToken': page_token,
	})
	.then(
		undefined,
		err => {
			console.error('fetch_livechat_list error', err);
		},
	);
}

gapi.load('client:auth2', async () => {
	await gapi.auth2.init({
		client_id: CLIENT_ID,
		scope: 'https://www.googleapis.com/auth/youtube.readonly',
	});
	await authenticate();
	await load_client();
});

let clear_impl = () => {};

function clear(x, y) {
	clear_impl(x, y);
}

function toggle_canvas() {
	canvas.style.display =
		canvas.style.display == 'block' ? 'none' : 'block';
}

document.addEventListener('DOMContentLoaded', () => {
	canvas = document.querySelector('canvas');
	ctx = canvas.getContext('2d');
	ctx.fillStyle = '#fff';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	on_frame();
	const { width: canvas_width, height: canvas_height } = canvas;
	const n_cols = 5;
	const n_rows = 4;
	const cell_width = Math.floor(canvas_width / n_cols);
	const cell_height = Math.floor(canvas_height / n_rows);
	let last_cell_x = 0;
	let last_cell_y = 0;
	clear_impl = (x, y) => {
		requestAnimationFrame(() => {
			ctx.fillRect(x * cell_width, y * cell_height, cell_width, cell_height);
		});
	};
	function add_image(url) {
		const cell_img = document.createElement('img');
		cell_img.src = 'api/' + encodeURIComponent(url);
		cell_img.addEventListener('load', () => {
			if ('naturalHeight' in cell_img) {
				if (cell_img.naturalWidth + cell_img.naturalHeight == 0) {
					return;
				}
			}
			else if (cell_img.width + cell_img.height == 0) {
				return;
			}
			requestAnimationFrame(((x, y) => () => {
				ctx.drawImage(cell_img, x, y, cell_width, cell_height);
			})(last_cell_x * cell_width, last_cell_y * cell_height));
			++last_cell_x;
			if (last_cell_x >= n_cols) {
				last_cell_x = 0;
				++last_cell_y;
				if (last_cell_y >= n_rows) {
					last_cell_y = 0;
				}
			}
		});
	}
	document.querySelector('[data-action="begin-fetching"]').addEventListener('click', async () => {
		const stream_id = document.querySelector('#stream-id').value;
		const { result: stream_info } = await fetch_stream_info(stream_id);
		const live_chat_id = stream_info.items[0].snippet.liveChatId;
		console.log(`Live chat id: ${live_chat_id}`);
		let page_token;
		for (;;) {
			const { result: live_chat_list } = await fetch_live_chat_list(live_chat_id, page_token);
			page_token = live_chat_list.nextPageToken;
			for (const { snippet: chat } of live_chat_list.items) {
				const content = chat?.textMessageDetails?.messageText;
				if (!content) {
					continue;
				}
				add_image(content);
				console.log(content);
			}
			await new Promise(r => setTimeout(
				r,
				Math.max(3000, live_chat_list.pollingIntervalMillis * 2),
			));
		}
	});
	document.querySelector('[data-action="go-live"]').addEventListener('click', () => {
		const ws = new WebSocket(
			window.location.protocol.replace('http', 'ws') + '//' +
			window.location.host +
			'/rtmp/' +
			encodeURIComponent(STREAM_URL),
		);
		let media_stream;
		let media_recorder;
		ws.addEventListener('open', e => {
			console.log('WebSocket open', e);
			media_stream = document.querySelector('canvas').captureStream(30);
			media_recorder = new MediaRecorder(media_stream, {
				mimeType: 'video/webm;codecs=h264',
				videoBitsPerSecond: 3 * 1024 * 1024,
			});
			media_recorder.addEventListener('dataavailable', e => {
				ws.send(e.data);
			});
			media_recorder.addEventListener('stop', ws.close.bind(ws));
			media_recorder.start(1000);
		});
		ws.addEventListener('close', e => {
			console.log('WebSocket close', e);
			media_recorder.stop();
		});
	});
});
