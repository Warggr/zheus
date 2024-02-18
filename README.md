# ZHeuS
Sign up for ZHS courses as fast as lightning ⚡

## Background

[ZHS](https://zhs-muenchen.de) offers sport courses for Munich students, but has limited places.
This script signs up in your name, ensuring that you are among the first to sign up.

## Disclaimer

**Warning**: this is a work in progress. The developers take no responsibility for what happens if you run the script.
In particular, it will transmit your banking data to ZHS and agree in your name to a Lastschriftverfahren.
A bug in this script could potentially cost you a lot of money!

## Usage

1. Make sure you have [Node.js](https://nodejs.org) installed.
1. Install required dependencies with `npm install`
1. Copy `config/example.user_data.json` into `config/user_data.json` and fill in your data.
1. *Optional: validate your user data with `npm run validate-config`*
1. Run the script: `node src/index.js`
