const HTMLParser = require('node-html-parser');
const assert = require('node:assert').strict;
const fs  = require("node:fs");
const path = require("node:path");
const https = require('https');

const agent = new https.Agent({ keepAlive: true });

let LOG_DIR;
LOG_DIR = 'log';
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR);
const timeStamp = new Date().toISOString();
LOG_DIR = path.join(LOG_DIR, timeStamp);
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR);

function add_to_params(data, params){
	for(let [key, value] of Object.entries(data)){
		params.append(key, value);
	}
}

async function fetch_html(options = {}, url, fetch_options = {}){
	fetch_options.agent = agent;
	let response = await fetch(url, fetch_options);
	assert(response.ok);
	let html = await response.text();

	let log_file = path.join(LOG_DIR, options.filename || 'unknown.html');
	console.log(`Writing file to ${log_file}`);
	fs.writeFileSync(log_file, html);

	return HTMLParser.parse(html);
}

async function get_course_ids(course_url){
	let fragment;
	[course_url, fragment] = course_url.split('#');

	let html = await fetch_html({filename:'course_page.html'}, course_url);
	let form = html.querySelector('body > div#page-body > div.belt > div#normal > div#content > div#bs_content > form');
	let BS_code = form.firstChild.getAttribute('value');

	let course_info_input = form.getElementById(fragment).nextElementSibling;
	assert(course_info_input.getAttribute('value') == "buchen");
	let course_id = course_info_input.getAttribute('name');

	console.log(`Found course_id=${course_id}, BS_code=${BS_code}`)
	return [ course_id, BS_code, course_url ];
}

const ZHS_URL = 'https://www.buchung.zhs-muenchen.de'; // 'http:localhost:8000';
const page_url = ZHS_URL + '/cgi/anmeldung.fcgi';

async function main(course_id, BS_code, course_url){
	let params = new URLSearchParams();
	// fetch() automatically sends URLSearchParams as x-www-form-urlencoded content
	params.append('BS_Code', BS_code);
	params.append(course_id, 'buchen');

	let html = await fetch_html({filename:'form-1.html'}, page_url, {
		method: 'POST',
		body: params,
		headers: {
			'Referer': course_url, // turns out that's actually important and it won't work without it
		}
	});

	let fid = html.lastChild // body
		.childNodes[2]
		.getAttribute('value'); // input type=hidden name=fid
	// TODO: research: how long are the fids still active?

	params = new URLSearchParams();
	const personal_data = require('../config/user_data.json');
	// TODO do this more efficiently, or offline
	personal_data['freifeld4'] = personal_data['nationalitaet']; delete personal_data['nationalitaet'];
	personal_data['freifeld5'] = personal_data['fachsemester']; delete personal_data['fachsemester'];
	personal_data['freifeld6'] = personal_data['einwilligung-daten-aus-tumonline']; delete personal_data['einwilligung-daten-aus-tumonline'];
	if(personal_data['kontoinh'] === undefined) personal_data['kontoinh'] = '';
	const other_data = {
		fid: fid,
		tnbed: '1 ', // no idea what this is
	};
	other_data[`pw_newpw_${fid}`] = '';

	const raw_zhs_data = JSON.parse(html.querySelector('div#formdata').innerText);
	const course_cost = raw_zhs_data['entgelte'][0]; // in euros
	// TODO make sure that this is always accurate and adapted to e.g. non-students

	let all_data = {...personal_data, ...other_data};
	if(course_cost != 0){
		all_data['bic'] = ''; // is somehow computed automatically by zHS later
	} else {
		delete all_data['iban']; delete all_data['kontoinh'];
	}
	add_to_params(all_data, params);

	html = await fetch_html({filename:'form-confirm.html'}, page_url, {
		method: 'POST',
		body: params,
		headers: { Referer: page_url },
	});

	params = new URLSearchParams(); // you can't reuse a URLSearchParams object
	delete all_data['bic']; // will be recomputed now
	if(all_data['kontoinh'] == '') delete all_data['kontoinh'];

	add_to_params(all_data, params);
	params.append('Phase', 'final');
	params.append('_formdata', html.getElementsByTagName('input').filter(i => i.attrs.name == '_formdata')[0].getAttribute('value'));

	if(course_cost != 0){
		let hidden_inputs = html.getElementsByTagName('input').filter(i => i.attrs.type == 'hidden');
		let kv_pairs = Object.fromEntries(hidden_inputs.map(i => [i.attrs.name, i.attrs.value]));
		// kv_pairs['preis_anz'] = '1,00 EUR';
		for(let key of ['bic', 'preis_anz', 'mandat', 'bank']){
			// TODO: find out how those are computed - maybe we can compute them instead of parsing them
			// TODO: confirm whether preis_anz is the same than expected price
			params.append(key, kv_pairs[key]);
		}
	}

	let old_params = params;
	params = new URLSearchParams();
	for(let key of ['fid','Phase','tnbed','sex','vorname','name','strasse','ort','geburtsdatum','freifeld4','statusorig','matnr','freifeld5','freifeld6','email','preis_anz','iban','bic','bank','mandat','_formdata',`pw_newpw_${fid}`])
		params.append(key, old_params.get(key));

	// const sleep = ms => new Promise(r => setTimeout(r, ms));
	// for(let i = 0; i<20; i++){
	// 	console.log(`${i}...`);
	// 	await sleep(1000);
	// }

	function fetch_curl(url, options){
		let curl = 'curl -v ' + url;
		let method = options.method || 'GET';
		if(method != 'GET') curl += ' -X ' + method;

		let headers = options.headers || {};

		let body = options.body || null;
		if(body instanceof URLSearchParams) { body = body.toString(); headers['content-type'] = 'application/x-www-form-urlencoded;charset=UTF-8'; }
		if(body !== null){ curl += ' --data \'' + body + '\''}

		for(let [key, value] of Object.entries(headers)){
			curl += ` -H '${key}: ${value}'`;
		}
		console.log(curl);
		return new Promise((resolve, reject) => { reject(); })
	}

	console.log(params);
	//	const new_page_url = 'http://localhost:3000/cgi/anmeldung.fcgi';
	await new Promise((resolve, reject) => { setTimeout(() => resolve(), 2000); });
	response = await fetch_curl( page_url, {
		method: 'POST',
		body: params,
		headers: {
			'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:124.0) Gecko/20100101 Firefox/124.0',
			Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
			'Accept-Language': 'en-US,en;q=0.5',
//			'Accept-Encoding': 'gzip, deflate, br',
			Origin: 'https://www.buchung.zhs-muenchen.de',
			Referer: page_url,
			'Sec-Fetch-Dest': 'document',
			'Sec-Fetch-Mode': 'navigate',
			'Sec-Fetch-Site': 'same-origin',
			'Sec-Fetch-User': '?1',
		},
		agent,
	});
	if(response.status != 302){
		let text = await response.text();
		fs.writeFileSync(path.join(LOG_DIR, 'final.html'), text);
		console.warn(`Error... logging to ${path.join(LOG_DIR, 'final.html')}`)
	}
	assert(response.status == 302);
	console.log('Success! Your confirmation is here: ' + response.headers.get('location'));
}

const url = 'https://www.buchung.zhs-muenchen.de/angebote/aktueller_zeitraum_0/_Basic-Ticket.html#K00001';

get_course_ids(url)
.then(([course_id, BS_code, course_url]) => main(course_id, BS_code, course_url))
.catch(err => console.error(err));
