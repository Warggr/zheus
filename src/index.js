const HTMLParser = require('node-html-parser');
const assert = require('node:assert').strict;

function add_to_params(data, params){
	for(let [key, value] of Object.entries(data)){
		params.append(key, value);
	}
}

async function fetch_html(...args){
	let response = await fetch(...args);
	assert(response.ok);
	let html = await response.text();
	return HTMLParser.parse(html);
}

async function get_course_ids(course_url){
	let fragment;
	[course_url, fragment] = course_url.split('#');

	let html = await fetch_html(course_url);
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
	const course_cost = 0; // in euros

	let params = new URLSearchParams();
	// fetch() automatically sends URLSearchParams as x-www-form-urlencoded content
	params.append('BS_Code', BS_code);
	params.append(course_id, 'buchen');

	let html = await fetch_html(page_url, {
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
	const personal_data = require('../config/user_data.json'); // TODO add data validation
	// TODO do this more efficiently, or offline
	personal_data['freifeld4'] = personal_data['nationalitaet']; delete personal_data['nationalitaet'];
	personal_data['freifeld5'] = personal_data['fachsemester']; delete personal_data['fachsemester'];
	personal_data['freifeld6'] = personal_data['einwilligung-daten-aus-tumonline']; delete personal_data['einwilligung-daten-aus-tumonline'];
	const other_data = {
		fid: fid,
		pw_email: '',
		tnbed: '1 ', // no idea what this is
	};
	other_data[`pw_pwd_${fid}`] = '';

	let all_data = {...personal_data, ...other_data};
	if(course_cost != 0){
		all_data['bic'] = ''; // is somehow computed automatically by zHS later
	} else {
		delete all_data['iban']; delete all_data['kontoinh'];
	}
	add_to_params(all_data, params);

	html = await fetch_html(page_url, {
		method: 'POST',
		body: params,
		headers: { Referer: page_url },
	});
	let form_body = html.querySelector('body > form > div#bs_form_content > div#bs_form_main'); // TODO make this more efficient

	params = new URLSearchParams(); // you can't reuse a URLSearchParams object
	add_to_params(all_data, params);
	params.append('Phase', 'final');
	params.append('_formdata', form_body.childNodes[15].getAttribute('value'));

	if(course_cost != 0){
		for(let key of ['bic', 'preis_anz', 'mandat']){
			// TODO: first, test with a paying course and fill out the code snippet
			// TODO: find out how those are computed - maybe we can compute them instead of parsing them
			// TODO: confirm whether preis_anz is the same than expected price
			// TODO: check if we could pay less by setting a lower price :)
			/*let value = '';
			params.append(key, value);*/
		}
	}

	console.log(params);
	response = await fetch(page_url, {
		method: 'POST',
		body: params,
		headers: { Referer: page_url },
	});
	assert(response.status == 302);
	console.log('Success! Your confirmation is here: ' + response.headers.get('location'));
}

const url = 'https://www.buchung.zhs-muenchen.de/angebote/aktueller_zeitraum_0/_Bogensport.html#K40204';

get_course_ids(url)
.then(([course_id, BS_code, course_url]) => main(course_id, BS_code, course_url))
.catch(err => console.error(err));
