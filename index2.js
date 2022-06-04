const fs = require("fs");
const http = require("http");
const https = require("https");
const querystring = require("querystring");


//list of all categories of data
const datasets = ["Address","Appliance","App","Bank","Beer","Blood","Business Credit Card","Cannabis","Code","Coffee","Commerce",
"Company","Computer","Crypto","CryptoCoin","Color","Dessert","Device","Food","Name","Hipster","Invoice","Users",
"Stripe","Subscription","Vehicle","ID Number","Internet Stuff","Lorem Ipsum","Lorem Flickr","Lorem Pixel","Nation",
"Number","Phone Number","Placeholdit","Restaurant"]

//import id, secret, and scope
const {client_id, client_secret, scope} = require("./auth/google-credentials.json");

const host = "localhost";
const port = 3000;


const server = http.createServer();


server.on("listening", listen_handler);
server.listen(port);

//when server starts
function listen_handler(){
	console.log(`Now Listening on Port ${port}`);
	console.log(server.address());
}

server.on("request",connection_handler);
function connection_handler(req, res){
	console.log(`New Request for ${req.url} from ${req.socket.remoteAddress}`)

    //goes to root to get credentials for google drive
	if(req.url == "/"){
		const main = fs.createReadStream('html/main.html');
		res.writeHead(200, {'Content-Type':'text/html'});
		main.pipe(res);
	}
	else if(req.url == "/favicon.ico"){
	 	const main = fs.createReadStream('images/favicon.ico');
	 	res.writeHead(200, {'Content-Type':'image/x-icon'});
	 	main.pipe(res);
	}

    //clicking button sends you here to start process of getting authorization
	else if(req.url.startsWith('/google_account')){
        redirect_to_Drive(res);
	}

    //we get the code after we log in
    else if(req.url.startsWith('/get_token')){//says token but ignore that
        const my_url = new URL(req.url, 'https://localhost:3000');
        const code = my_url.searchParams.get('code');
        if(code === undefined){
		    not_found(res);
		    return;
		}
        //use code to get token
        send_access_token_request(code, res);
        
	}

    //after we input data
	else if(req.url.startsWith('/Data_input')){
		const my_url = new URL(req.url, 'https://localhost:3000');
		const datatype = my_url.searchParams.get('data_type');
        const amount = my_url.searchParams.get('amount');
        if (datasets.includes(my_url.searchParams.get('data_type')) && (Number.isInteger(Number(amount)))){//checks if input parameters are proper
            const authentication_cache = './cache/token.json';
            let cache_valid = false;
            if(fs.existsSync(authentication_cache)){
	            cached_auth = require(authentication_cache);
	            if(new Date(cached_auth.expires_in) > Date.now()){
		            cache_valid = true;
                }
            }   
            if(cache_valid){
                change_page(res, datatype, amount, authentication_cache);
            }
            else{//if cache is deleted then you're redirected to the front page where youll sign in again
                const main = fs.createReadStream('html/main.html');
		        res.writeHead(200, {'Content-Type':'text/html'});
		        main.pipe(res);
            }
        }
        else{//resets page if input is wrong
            console.log("not a word/number");
            generate_page(res);
        }

	}
	else {
		res.write(`REPLACE WITH CATCHALL`);
		res.end();
	}
}

//redirected from root to log in to google
function redirect_to_Drive(res){
	const authorization_endpoint = "https://accounts.google.com/o/oauth2/v2/auth";
     let uri = querystring.stringify({client_id, scope,"redirect_uri":"http://localhost:3000/get_token","response_type":"code","type":"code"});
     //console.log(`${authorization_endpoint}?${uri}`);
	 res.writeHead(302, {Location: `${authorization_endpoint}?${uri}`})
	.end();
}


//make request for the token
function send_access_token_request(code, res){
	const token_endpoint = "https://oauth2.googleapis.com/token";
	const post_data = querystring.stringify({"client_id":client_id, "client_secret":client_secret, "code":code,"grant_type":"authorization_code","redirect_uri":"http://localhost:3000/get_token"});
	//console.log(`${client_id},\n${client_secret},\n${code},\n"grant_type":"authorization_code",\n"redirect_uri":"http://localhost:3000/Data_to_Drive"`);
    //console.log(post_data);
	let options = {
		method: "POST",
		headers:{
			"Content-Type":"application/x-www-form-urlencoded"
		}
	}
    let auth_sent_time = new Date;
	https.request(
		token_endpoint, 
		options, 
		(token_stream) => process_stream(token_stream, receive_access_token, res, auth_sent_time)
	).end(post_data);
}

function process_stream (stream, callback , ...args){
	let body = "";
	stream.on("data", chunk => body += chunk);
	stream.on("end", () => callback(body, ...args));
}

//we've recieved the token and put it in json format
function receive_access_token(body, res, auth_sent_time){
	let access_token = JSON.parse(body);
    place_in_cache(access_token, res, auth_sent_time);
}

//here we place it in cache
function place_in_cache(access_token,res, auth_sent_time){
    access_token.expires_in = new Date(access_token.expires_in*1000 + auth_sent_time.getTime());
	create_access_token_cache(access_token,res);
	function create_access_token_cache(cachedtoken, res){
        let cacheToken = JSON.stringify(cachedtoken);
		fs.writeFileSync('./cache/token.json', cacheToken, generate_page(res));
	}
}

//creates the page to input data
function generate_page(res){
    const main = fs.createReadStream('html/main2.html');
	res.writeHead(200, {'Content-Type':'text/html'});
	main.pipe(res);
}

//not relevant anymore
function change_page(res, data_type, amount, authentication_cache){//made changes so not relevant
    get_data_from_api(data_type, amount, authentication_cache,res)
}


//we get the data from data generator api
function get_data_from_api(data_type, amount, authentication_cache,res){
    const second_api_endpoint = `https://random-data-api.com/api/${data_type.toLowerCase().replaceAll(' ', '_')}/random_${data_type.toLowerCase().replaceAll(' ', '_')}?size=${amount}`;
    let options = {
		method: "GET",
		headers:{
			"Content-Type":"application/x-www-form-urlencoded"
		}
	};
    https.request(
		second_api_endpoint,
        options, 
		(data_stream) => process_stream(data_stream, create_file, authentication_cache,res,data_type, amount)
	).end();
}

//save the most recent data set
function create_file(body, authentication_cache,res,data_type, amount){
    // const create = fs.createWriteStream('./store_file/data.txt')
    // create.write(body);
    // create.end(()=>send_to_drive(authentication_cache,res,data_type, amount));
    send_to_drive(body, authentication_cache,res,data_type, amount);
}

//starts the process of sending the file, first sends the metadata
function send_to_drive(body, authentication_cache,res,data_type, amount){
    const Drive_endpoint = "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable";
    const {access_token} = require(authentication_cache)
    //let stats = fs.statSync("./store_file/data.txt")
    //let fileSizeInBytes = 
    let metadata = {
        'name': `CS355_24106752_project_FILE_type=${data_type}_amount=${amount}`, // Filename at Google Drive
        'mimeType': 'text/plain' // mimeType at Google Drive
    };
    let options = {
		method: "POST",
		headers:{
			"Content-Type":"application/json; charset=UTF-8",
            Authorization: `Bearer ${access_token}`,
            "X-Upload-Content-Type": "text/plain"
            //"X-Upload-Content-Length":  fileSizeInBytes
		},
	}
    const req = https.request(
        Drive_endpoint, 
        options,
        (response) => send_to_drive2(body, response.headers, access_token,res)
    );
    req.write(JSON.stringify(metadata));
    req.end();

}

//changed so mostly defunct except to get the new endpoint from the post message we sent in last function
function send_to_drive2(body, data, access_token,res){
    const location = data.location;

    // const file = fs.createReadStream("./store_file/data.txt");
    // let str = ""
    // file.on('data',(chunk) => str+=chunk);
    // file.on('end',() => {
    //     //console.log(str);
    //     send_to_drive3(str,fileSizeInBytes,location, access_token,res);
    // });
    send_to_drive3(body,location, access_token,res);

}

//writes the string to drive in anew file
function send_to_drive3(str,location, access_token,res){
    //var file = new Blob([str], {type: 'text/plain'});
    
    let options = {
		method: "POST",
		headers:{
			"Content-Type":"application/x-www-form-urlencoded",
            //"Content-Length":fileSizeInBytes,
            Authorization: `Bearer ${access_token}`
		},
	};
    const send = https.request(
		location, 
		options, 
    );
    send.write(str);
    send.end(()=> {finished_writing(res)});
}

//finishes sending file and resets page.
function finished_writing(res){
    console.log('file sent');
    generate_page(res);
}




