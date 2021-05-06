// JavaScript Document

// Display: 320 x 480

'use strict';

var plexParams = "";
var reqNo = 0;
var activePlayer;
var activePlayerTrack = "";
var photo_list = []; // array with all the photos on Plex
var num_photos;
var status_fetch = false;
var playing = false; // true when music actually playing, false if paused etc
var paused = false; // true when music paused
var screen = "wait"; // can be either "wait", "photos", "music" or "stations"
var play_time = Date.now() / 1000;
var tab_data = []; // record of player associated with tabs
var command_id = 1;
var photo_timer;
var getting_status = false; // true when plex status is being fetched

var swipe_start = {}; // starting position of the swipe gesture
var swipe_functions = { "up": undefined, "down": undefined, "left": undefined, "right": undefined };

var worker;
var worker_ready = false;
var worker_discovery_complete = false;

var radio_stations = [
    { file: "iframe-bbc-4.html", logo_type: "jpg", url: "bbc-radio-4" },
    { file: "iframe-bbc-2.html", logo_type: "jpg", url: "bbc-radio-2" },
    { file: "iframe-ghr-bristol.html", logo_type: "jpg", url: "greatest-hits-radio" },
    { file: "iframe-absolute-80s.html", logo_type: "png", url: "absolute-80s" },
    { file: "iframe-gold.html", logo_type: "jpg", url: "gold" },
    { file: "iframe-magic.html", logo_type: "jpg", url: "magic-radio" }
];
var radio = false; // true when displaying the radio page


/*---------------------------------------------------------------------------------*/
function log(str, level) {
    var d = new Date();
    switch (level) {
        case "error":
            console.log(`${d.toUTCString()} ${str}`);
            break;
        default:
            if (debug)
                console.log(`${d.toUTCString()} ${str}`);
    }
}

// get authentication token from the Plex server as per https://gitlab.com/media-scripts/apps/blob/d757a26601b2b33c12884a1ff45cf8db690f2fa1/plex/p2/plex_token.py
// function is written synchronously as we can't do anything without the token
async function construct_params() {
    var params;
    var client_id = makeid(16);
    var encoded = "Basic " + btoa(plex_username + ":" + plex_password);
    tokens.push(["X-Plex-Client-Identifier", client_id]);
    var new_tokens = tokens.slice();
    new_tokens.push(['Authorization', encoded]);
    try {
        var fetch_response = await fetch("https://plex.tv/users/sign_in.json", // request token from Plex server
            {
                method: "POST",
                cache: "no-cache",
                headers: new_tokens
            });
        if (!fetch_response.ok) {
            log("Token retrieval response not OK");
            document.getElementById("please-wait-p").innerText = "Auhentication error";
            return 0;
        }
        var text = await fetch_response.text();
        try {
            params = JSON.parse(text);
        } catch (err) {
            log("---- Error parsing authorisation response " + text, "error");
            document.getElementById("please-wait-p").innerText = "Auhentication error";
            return 0;
        }
        var authtoken = params.user.authToken;
        if ((authtoken === undefined) || (authtoken.length == 0)) {
            log("Malformed authentication token: ".authtoken);
            document.getElementById("please-wait-p").innerText = "Auhentication error";
            return 0;
        }
        tokens.push(["X-Plex-Token", authtoken]);
        tokens.forEach(function(param) {
            if (plexParams.length > 0)
                plexParams += "&";
            plexParams += param[0] + "=" + encodeURIComponent(param[1]);
        });
        tokens.push(['Accept', 'application/json']);
        if (worker !== undefined) {
            while (!worker_ready)
                await __delay__(500);
            worker.postMessage({ "type": "params", "data": { "params": plexParams, "tokens": tokens, "codecs": codecs, "max_video_resolution": max_video_resolution } });
            log("Sent params to worker");
        }
        return 1;
    } catch {
        log('There has been a problem obtaining the authentication token', "error");
        set_wait_div_message("Authentication error");
        return 0;
    }
}

function makeid(length) {
    var result = '';
    var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var charactersLength = characters.length;
    for (var i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

// add timeout to a promise as per https://stackoverflow.com/a/46946573/11558356
function timeout(ms, promise) {
    return new Promise(function(resolve, reject) {
        setTimeout(function() {
            reject(new Error("timeout"))
        }, ms);
        promise.then(resolve, reject)
    })
}

// fetch required resource from url then call function func with the response and additional argument arg
// add a 10s time-out to all calls
function call_fetch(url, func, arg, err_func) {
    if (url.includes("?"))
        url += "&";
    else
        url += "?";
    url += "session=plexmain";
    while (status_fetch)
        __delay__(500);
    status_fetch = true;
    timeout(10000, fetch(plexUrl + url, { cache: "no-cache", headers: tokens }).then(function(response) {
            status_fetch = false;
            if (response.ok) {
                response.text().then(function(txt) { func(txt, arg) }, func, arg);
            } else {
                throw new Error('Network response was not "ok".');
            }
        }), func, arg)
        .catch(function(error) {
            status_fetch = false;
            log(`There has been a problem fetching ${url}: ${error.message}`, "error");
            if (err_func)
                err_func(error);
        });
}

function __delay__(timer) {
    return new Promise(resolve => {
        timer = timer || 2000;
        setTimeout(function() {
            resolve();
        }, timer);
    });
};

function remove_child(el) {
    if (el.childNodes.length == 1) {
        el.removeChild(el.childNodes[0]);
    }
}

function remove_all_children(el) {
    while (el.childNodes.length > 0) {
        el.removeChild(el.childNodes[0]);
    }
}

function show(el) {
    el.classList.remove("hidden");
    el.classList.add("visible");
}

function hide(el) {
    el.classList.add("hidden");
    el.classList.remove("visible");
}

function getTextWidth(text, font) {
    // re-use canvas object for better performance
    var canvas = getTextWidth.canvas || (getTextWidth.canvas = document.createElement("canvas"));
    var context = canvas.getContext("2d");
    context.font = font;
    var metrics = context.measureText(text);
    return metrics.width;
}

function longest_string(arr) {
    arr.sort((a, b) => a.length > b.length);
    return getTextWidth(arr[0], "Calibri");
}

function checkOverflow(el) {
    var curOverflow = el.style.overflow;
    if (!curOverflow || curOverflow === "visible")
        el.style.overflow = "hidden";
    var isOverflowing = el.clientWidth < el.scrollWidth ||
        el.clientHeight < el.scrollHeight;
    el.style.overflow = curOverflow;
    return isOverflowing;
}

function set_wait_div_message(str) {
    document.getElementById("please-wait-p").innerText = str;
}

/*---------------------------------------------------------------------------------*/
function start_worker() {
    if (typeof(Worker) !== "undefined") {
        worker = new Worker("js/plex_worker.js");
        worker.onmessage = receive_message;
    } else {
        log("No Web Worker support!!", "error");
    }
}

function add_swipe_events() {
    window.addEventListener('mousedown', record_swipe_start, true);
    window.addEventListener('touchstart', record_swipe_start);
    window.addEventListener('mouseup', action_swipe_end, true);
    window.addEventListener('touchend', action_swipe_end);
}

function init_swipes() {
    switch (screen) {
        case "music":
            swipe_functions.left = function() { skip_next_track() };
            swipe_functions.right = function() { skip_previous_track() };
            swipe_functions.up = function() { show_radio() };
            swipe_functions.down = undefined;
            break;
        case "radio":
            swipe_functions.left = undefined;
            swipe_functions.right = undefined;
            swipe_functions.up = undefined;
            swipe_functions.down = function() { hide_radio() };
            break;
        case "photos":
            swipe_functions.left = function() {
                clearTimeout(photo_timer);
                request_photo()
            };
            swipe_functions.right = function() {
                clearTimeout(photo_timer);
                request_photo()
            };
            swipe_functions.up = function() { show_radio() };
            swipe_functions.down = undefined;
            break;
        default:
            swipe_functions.left = undefined;
            swipe_functions.right = undefined;
            swipe_functions.up = undefined;
            swipe_functions.down = function() { hide_radio() };
            break;
    }
}

function record_swipe_start(event) {
    if (event.changedTouches) {
        var touchobj = event.changedTouches[0];
        swipe_start = { "x": touchobj.clientX, "y": touchobj.clientY };
    } else {
        swipe_start = { "x": event.screenX, "y": event.screenY };
    }
    log(`Touch start: ${swipe_start.x}, ${swipe_start.y}`);
}

function action_swipe_end(event) {
    var x, y;
    if (event.changedTouches) {
        var touchobj = event.changedTouches[0];
        x = touchobj.clientX;
        y = touchobj.clientY;
    } else {
        x = event.screenX;
        y = event.screenY;
    }
    log(`Touch end: ${x}, ${y}`);
    var x_diff = x - swipe_start.x;
    var y_diff = y - swipe_start.y;
    if ((Math.abs(x_diff) < 50) && Math.abs(y_diff) < 50) {
        return;
    }
    if (Math.abs(x_diff) > Math.abs(y_diff)) { // left/right
        if (x_diff < 0) {
            if (swipe_functions.left != undefined) { swipe_functions.left(); }
        } else
        if (swipe_functions.right != undefined) { swipe_functions.right(); };
    } else { // up/down
        if (y_diff < 0) {
            if (swipe_functions.up != undefined) { swipe_functions.up(); }
        } else
        if (swipe_functions.down != undefined) { swipe_functions.down(); };
    }
}


/*---------------------------------------------------------------------------------*/
function show_radio() {
    screen = "radio";
    manage_ui();
}

function hide_radio() {
    screen = "photos";
    remove_playing_station();
    request_photo();
    manage_ui();
}

function add_station(args) {
    timeout(10000, fetch(args.station.file, { cache: "no-cache", method: "HEAD" }).then(function(response) {
            if (response.ok) {
                var stations_div = document.getElementById("radio-stations");
                var new_img = document.createElement("img");
                new_img.index = args.index;
                new_img.onclick = select_station;
                new_img.setAttribute("class", "radio-station-img");
                new_img.setAttribute("draggable", "false");
                new_img.src = `https://ukradiolive.com/public/uploads/radio_img/${args.station.url}/play_250_250.${args.station.logo_type}`;
                stations_div.appendChild(new_img);
            } else {
                throw new Error('Network response was not "ok".');
            }
        }), args)
        .catch(function(error) {
            log(`There has been a problem fetching ${args.station.file}: ${error.message}`, "error");
        });
}

function add_stations() {
    var i;
    for (i = 0; i < radio_stations.length; i++) {
        add_station({ index: i, station: radio_stations[i] });
    }
}

function remove_playing_station() {
    remove_all_children(document.getElementById("radio-playing"));
}

// ukradiolive uses https which means the server requires TLS support (else use localhost)
function select_station() {
    var station = radio_stations[this.index];
    var playing_div = document.getElementById("radio-playing");
    remove_playing_station();
    var new_iframe = document.createElement("iframe");
    new_iframe.src = station.file;
    new_iframe.setAttribute("class", "radio-playing-iframe");
    if (screen === "radio") { // check that another action has not cancelled radio mode in the meanwhile
        playing_div.appendChild(new_iframe);
    }
}

/*---------------------------------------------------------------------------------*/
function update_progress_bar(track) {
    var bar = document.getElementById("progress-bar");
    try {
        bar.style.width = (100 * track.viewOffset / track.duration) + "%";
    } catch (err) {
        bar.style.width = "0";
    }
}

function clear_tabs() {
    remove_all_children(document.getElementById("playing"));
    tab_data = [];
}

function clear_track() {
    document.getElementById("track").innerHTML = "";
    remove_child(document.getElementById("artist-art"));
    document.getElementById("artist").innerHTML = "";
    document.getElementById("album").innerHTML = "";
    remove_child(document.getElementById("album-art"));
    update_progress_bar();
}

// called on mouse event to change to new player tab
function change_active_player(e) {
    activePlayer = tab_data[this.attributes.tab_index.nodeValue];
}

// called on swipe left to change to next player tab (if one exists)
function next_player() {
    var tabs = document.getElementsByClassName("tabs"); // find all the player tabs being displayed
    var i = 0;
    while (tabs[i].getAttribute("class") != "active-tab tabs") {
        i++;
        if (i == tabs.length)
            return;
    }
    if ((i < 2) && (tabs[i + 1].getAttribute("class") == "inactive-tab tabs")) {
        activePlayer = tab_data[tabs[i + 1].attributes.tab_index.nodeValue];
        log("Changed to next player");
    }
}

// called on swipe right to change to previous player tab (if one exists)
function previous_player() {
    var tabs = document.getElementsByClassName("tabs"); // find all the player tabs being displayed
    var i = 0;
    while (tabs[i].getAttribute("class") != "active-tab tabs") {
        i++;
        if (i == tabs.length)
            return;
    }
    if ((i > 0) && (tabs[i - 1].getAttribute("class") == "inactive-tab tabs")) {
        activePlayer = tab_data[tabs[i - 1].attributes.tab_index.nodeValue];
        log("Changed to previous player");
    }
}

function skipped_next_track() {
    log("Skipped to next track");
}

function skip_next_track() {
    var tabs = document.getElementsByClassName("tabs"); // find all the player tabs being displayed
    var i = 0;
    while (tabs[i].getAttribute("class") != "active-tab tabs") {
        i++;
        if (i == tabs.length)
            return;
    }
    var player = tab_data[tabs[i].attributes.tab_index.nodeValue];
    var client_session = player.split(":");
    var skip_command = `/player/playback/skipNext?type=music&commandID=${command_id++}&X-Plex-Target-Client-Identifier=${client_session[0]}`;
    call_fetch(skip_command, skipped_next_track);
}

function skipped_previous_track() {
    log("Skipped to previous track");
}

function skip_previous_track() {
    var tabs = document.getElementsByClassName("tabs"); // find all the player tabs being displayed
    var i = 0;
    while (tabs[i].getAttribute("class") != "active-tab tabs") {
        i++;
        if (i == tabs.length)
            return;
    }
    var player = tab_data[tabs[i].attributes.tab_index.nodeValue];
    var client_session = player.split(":");
    var skip_command = `/player/playback/skipPrevious?type=music&commandID=${command_id++}&X-Plex-Target-Client-Identifier=${client_session[0]}`;
    call_fetch(skip_command, skipped_previous_track);
}

function display_tabs(tracks) {
    clear_tabs();
    var player, playerState, playerTitle, p;
    var tabs_div = document.getElementById("playing");
    for (var i = 0; i < ((tracks.length > 3) ? tracks.length : 3); i++) {
        var tab = document.createElement("div");
        tab.setAttribute("id", "tab" + (i + 1));
        tab.setAttribute("tab_index", i);
        if (i < tracks.length) {
            player = tracks[i].Player;
            [p, playerState] = return_player_and_state(tracks[i]);
            tab_data[i] = p;
            playerTitle = player.title; // eg Chrome or Galaxy A5(2017)
            tab.innerHTML = `${playerState} on ${playerTitle}`;
            tab.onclick = change_active_player;
            if (p == activePlayer)
                tab.setAttribute("class", "active-tab tabs");
            else
                tab.setAttribute("class", "inactive-tab tabs");
        } else {
            tab.setAttribute("class", "hidden-tab tabs");
        }
        tabs_div.appendChild(tab);
    }
    for (var i = 0; i < tracks.length; i++) {
        var font = 20;
        var tab = document.getElementById("tab" + (i + 1));
        while (checkOverflow(tab)) {
            if (font < 8)
                break;
            font -= 0.5;
            tab.style.fontSize = font + "px";
        }
    }
}

// check whether the HTTP headers indicate that an image was returned or not
function image_returned(headers) {
    var x;
    for (x of headers.entries())
        if ((x[0].toLowerCase() == "content-type") && (x[1].match(/^image/)))
            return true;
    return false;
}

// fetch image then add it to the DOM
function addImage(cl, url) {
    fetch(url, { method: "GET", headers: tokens })
        .then(function(response) {
            if ((response.ok) && (image_returned(response.headers) == true)) {
                response.blob().then(function(blob) {
                    var img = document.createElement("img");
                    img.onerror = function(event) { image_error(event); };
                    img.cl = cl;
                    img.setAttribute("draggable", "false");
                    img.onload = update_image;
                    img.setAttribute("src", URL.createObjectURL(blob));
                });
            } else
                log(`There has been a problem with fetching ${url}`, "error");
        }).catch(function(error) {
            log(`There has been a problem with fetching ${url}`, "error");
        });
}

// update the artist or album image with the new one
function update_image(event) {
    var cl_element = document.getElementById(event.target.cl);
    if (cl_element.childNodes.length == 1) {
        cl_element.replaceChild(event.target, cl_element.firstChild);
    } else {
        cl_element.appendChild(event.target);
    }
}

// if there was a problem loading the image, substitute a local image
function image_error(event) {
    log(`image error ${event.target.src}`, "error");
    event.target.onerror = null;
    event.target.src = "images/no_image.png";
}

function display_track(track) {
    var trackTitle = track.title;
    document.getElementById("track").innerHTML = trackTitle;
    var artist = track.grandparentTitle;
    document.getElementById("artist").innerHTML = artist;
    var albumTitle = track.parentTitle;
    albumTitle = albumTitle.replace(/(.*?)\[.*?\](.*)/, '$1$2');
    document.getElementById("album").innerHTML = albumTitle;
    var anim_dur = longest_string([trackTitle, artist, albumTitle]) / 15;
    anim_dur = (anim_dur < 7) ? 7 : anim_dur;
    document.getElementById("album").style.animationDuration = document.getElementById("track").style.animationDuration = document.getElementById("artist").style.animationDuration = anim_dur.toString() + "s";
    var albumArtUrl = track.parentThumb;
    // check if there is album art, else display something in its place
    if (albumArtUrl !== null) {
        albumArtUrl = plexUrl + albumArtUrl;
        addImage("album-art", albumArtUrl);
    } else {
        var img = document.createElement("img");
        img.setAttribute("draggable", "false");
        img.setAttribute("src", "images/no_image.png");
        remove_child(document.getElementById("album-art"));
        document.getElementById("album-art").appendChild(img);
    }
    // check if the artist is Soundtrack (usually found on albums from movies), if so display something sensible
    if (artist === "Soundtrack") {
        var img = document.createElement("img");
        img.setAttribute("draggable", "false");
        img.setAttribute("src", "images/soundtrack.jpg");
        remove_child(document.getElementById("artist-art"));
        document.getElementById("artist-art").appendChild(img);
    } else {
        var artistArtUrl = track.grandparentThumb;
        if (artistArtUrl !== null) {
            artistArtUrl = plexUrl + artistArtUrl;
            addImage("artist-art", artistArtUrl);
        } else {
            var img = document.createElement("img");
            img.setAttribute("src", "images/no_image.png");
            img.setAttribute("draggable", "false");
            remove_child(document.getElementById("artist-art"));
            document.getElementById("artist-art").appendChild(img);
        }
    }
}

// Return [track index of active player, xml doc of relevant track]
function current_track(tracks, player) {
    var p, playerState;
    try {
        for (var i = 0; i < tracks.length; i++) {
            [p, playerState] = return_player_and_state(tracks[i]);
            if (p == player) {
                playing = (playerState == "playing");
                paused = (playerState == "paused");
                return [i, tracks[i]];
            }
        }
    } catch { // get here if no tracks or no session
        log("Error in 'current_track', tracks = " + JSON.stringify(tracks), "error");
    }
    playing = false;
    paused = false;
    return [-1, ""];
}

function return_current_track_id(cTrack) {
    return (cTrack.grandparentKey + cTrack.parentKey + cTrack.title);
}

// return true if track has changed after comparing grandparent key, parent key and title
function track_changed(cTrack, storedTrack) {
    return (return_current_track_id(cTrack) !== storedTrack);
}

function return_player_and_state(track) {
    try {
        var p = track.Player;
        var s = track.Session;
        return ([p.machineIdentifier + ":" + s.id, p.state]);
    } catch {
        try {
            return (["", p.state]);
        } catch {
            return (["", ""]);
        }
    }
}

// look through the list of players and find one that is in the playing state
function find_new_playing_player(tracks) {
    var p, s;
    try {
        for (var i = 0; i < tracks.length; i++) { // find first player that is playing
            [p, s] = return_player_and_state(tracks[i]);
            if (s == "playing")
                return (p);
        }
    } catch { // get here if no tracks or no session
        log("Error in 'select_new_player', tracks = " + JSON.stringify(tracks), "error");
    }
    return ("");
}

// look through the list of players and find the first one, regardless of its state
function find_new_player(tracks) {
    var p, s;
    try {
        for (var i = 0; i < tracks.length; i++) { // find first player
            [p, s] = return_player_and_state(tracks[i]);
            return (p);
        }
    } catch { // get here if no tracks or no session
        log("Error in 'select_new_player', tracks = " + JSON.stringify(tracks), "error");
    }
    return ("");
}

// check the status from the PMS and decide whether the player is playing or paused or just disappeared (eg closed), find a new player if necessary, else allow the photo slide show to start
function process_status(result) {
    var status;
    getting_status = false;
    if (screen == "radio") {
        return;
    }
    try {
        status = JSON.parse(result);
    } catch (err) {
        log(`---- Error parsing PWS status ${result}`, "error");
    }
    var tracks = [];
    if (status.MediaContainer.Metadata !== undefined)
        tracks = status.MediaContainer.Metadata;
    if (activePlayer === undefined) { // this must be app starting
        activePlayer = find_new_player(tracks);
    }
    var [activePlayerIndex, currentTrack] = current_track(tracks, activePlayer);
    var player_listed = (activePlayerIndex >= 0);
    var not_playing_time = Date.now() / 1000 - play_time;
    var ap;

    if ((!player_listed) && (not_playing_time < 6)) {
        screen = "music";
        manage_ui();
        return;
    }

    // Stay with current player if its playing or if its been paused/buffering for under 60s  
    if (((player_listed) && (!playing) && (not_playing_time < 60)) ||
        ((player_listed) && (playing))) {
        screen = "music";
        display_tabs(tracks);
        if (track_changed(currentTrack, activePlayerTrack)) {
            activePlayerTrack = return_current_track_id(currentTrack);
            display_track(currentTrack);
        }
        update_progress_bar(currentTrack);
        manage_ui();
        return;
    }

    // Change to a new player if the current player is not listed anymore (for more than 10s) or it hasn't been playing for 60s and there's another player that is    
    if (((!player_listed) && (not_playing_time >= 10) && ((ap = find_new_playing_player(tracks)) != "")) ||
        ((player_listed) && (!playing) && (not_playing_time >= 60) && ((ap = find_new_playing_player(tracks)) != ""))) {
        screen = "music";
        activePlayer = ap;
        [activePlayerIndex, currentTrack] = current_track(tracks, activePlayer);
        display_tabs(tracks);
        activePlayerTrack = return_current_track_id(currentTrack);
        display_track(currentTrack);
        update_progress_bar(currentTrack);
        manage_ui();
        return;
    }

    // Switch to the photos if there are not players listed anymore (for more than 10s) or the current player hasn't been playing for at least 60s  
    if (((!player_listed) && (not_playing_time >= 10) && ((ap = find_new_player(tracks)) == "")) ||
        ((player_listed) && (!playing) && (not_playing_time >= 60) && ((ap = find_new_playing_player(tracks)) == ""))) {
        screen = "photos";
        activePlayer = "";
        clear_tabs();
        clear_track();
        activePlayerTrack = "";
        manage_ui();
        return;
    }

    manage_ui();
}

// display the track info with/out pause indication else photo slideshow
function manage_ui() {
    var circles = document.getElementById("circles-div");
    var pause_lines = document.getElementsByClassName("paused")[0];
    var photos = document.getElementById("photos");
    var stations = document.getElementById("stations");
    var wait = document.getElementById("please-wait");
    if (playing) {
        play_time = Date.now() / 1000;
    }
    init_swipes();
    switch (screen) {
        case "music":
            hide(wait);
            hide(photos);
            hide(stations);
            if (playing) {
                show(circles);
                hide(pause_lines);
            }
            if (paused) {
                hide(circles);
                show(pause_lines);
            }
            if (!playing && !paused) {
                hide(circles);
                hide(pause_lines);
            }
            break;
        case "photos":
            hide(wait);
            show(photos);
            hide(stations);
            hide(circles);
            hide(pause_lines);
            break;
        case "radio":
            hide(wait);
            hide(photos);
            show(stations);
            hide(circles);
            hide(pause_lines);
            break;
        case "wait":
            show(wait);
            hide(photos);
            hide(stations);
            hide(circles);
            hide(pause_lines);
        default:
    }
    if (circles.classList.contains("visible")) {
        for (var item of document.getElementsByClassName("circles"))
            item.classList.add("circle_animation");
    } else {
        for (var item of document.getElementsByClassName("circles"))
            item.classList.remove("circle_animation");
    }
}

function status_error() {
    getting_status = false;
}

// get the status of the PMS
function get_plex_status() {
    if (getting_status) {
        log("skipping getting plex status", "error");
        return;
    }
    getting_status = true;
    manage_ui();
    call_fetch("/status/sessions", process_status, null, status_error);
}

/*---------------------------------------------------------------------------------*/

function photo_image_error(event) {
    log(`Display photo error ${event.target.src}`, "error");
    clearTimeout(photo_timer);
    photo_timer = setTimeout(request_photo, 100);
}

// start playing the video once it has reached the state canplay
function play_video(event) {
    var video = event.target;
    video.oncanplay = null;
    var loading = document.getElementById("loading-video-p");
    var timer = setInterval(function() {
        if (video.paused && video.readyState == 4 || !video.paused) {
            video.play()
                .then(function(response) {
                    log("playing video " + video.getAttribute("src"));
                    hide(loading);
                })
                .catch(function(error) {
                    log(`There has been a problem with starting playback of the video: ${error.message}`, "error");
                    hide(loading);
                    clearTimeout(photo_timer);
                    request_photo();
                });
            clearInterval(timer);
        }
    }, 50);
}

function video_error(event) {
    var video = event.target;
    video.onerror = null;
    log(`Error playing video from ${video.getAttribute("src")}: ${event.type}`, "error");
    switch (video.error.code) {
        case video.error.MEDIA_ERR_ABORTED:
            log('You aborted the video playback.', "error");
            break;
        case video.error.MEDIA_ERR_NETWORK:
            log('A network error caused the video download to fail part-way.', "error");
            break;
        case video.error.MEDIA_ERR_DECODE:
            log('The video playback was aborted due to a corruption problem or because the video used features your browser did not support.', "error");
            break;
        case video.error.MEDIA_ERR_SRC_NOT_SUPPORTED:
            log('The video could not be loaded, either because the server or network failed or because the format is not supported.', "error");
            break;
        default:
            log('An unknown error occurred.', "error");
            break;
    }
    var loading = document.getElementById("loading-video-p");
    hide(loading);
    clearTimeout(photo_timer);
    photo_timer = setTimeout(request_photo, 1000);
}

// request photo from worker
function request_photo() {
    worker.postMessage({ "type": "photo-request" });
}

function receive_message(event) {
    var message = event.data;
    log(`Message received from worker: ${message.type}`);
    switch (message.type) {
        case "ready":
            worker_ready = true;
            break;
        case "discovery-complete":
            worker_discovery_complete = true;
            log(`Number of discovered photos = ${message.num_photos}`);
            break;
        case "photo":
            if (worker_ready && worker_discovery_complete) // message received too early if both not set
                display_photo(message.data);
            break;
        default:
    }
}

// if no music playing, display a photo/video
function display_photo(photo) {
    var loading = document.getElementById("loading-video-p");
    hide(loading);
    if (screen == "radio")
        return;
    if (screen != "photos") { // if music or radio is playing/active, don't bother updating the photo
        photo_timer = setTimeout(request_photo, 2000);
        return;
    }
    manage_ui();
    var image = document.getElementById("photo-img");
    image.setAttribute("visibility", "hidden");
    image.setAttribute("src", "");
    var video = document.getElementById("video-img");
    video.setAttribute("visibility", "hidden");
    video.setAttribute("src", "");
    video.volume = 0;
    var hour = new Date().getHours();
    var night = false;
    if ((hour < 9) || (hour > 21)) {
        night = true;
        log("Setting night time mode");
    }
    if (photo == undefined) {
        log("Hmm, no photos found ... ", "error");
        if (night) {
            image.setAttribute("src", "images/sleeping-cat-icegif-2.gif");
        } else {
            image.setAttribute("src", "images/no-photos.png");
        }
        image.setAttribute("visibility", "visible");
        photo_timer = setTimeout(request_photo, 10000);
        return;
    }
    if (night) {
        photo.type = "photo";
        photo.width = 480;
        photo.height = 320;
    }
    log(`Displaying photo/video ${photo.url}, width:height = ${photo.width}:${photo.height}`);
    switch (photo.type) {
        case "photo": // use the PMS transcoder to scale it to the right size and rotate it if necesary at the same time
            var url;
            if (night) {
                url = "images/sleeping-cat-icegif-2.gif";
            } else {
                url = plexUrl + "/photo/:/transcode?width=480&height=320&minSize=1&session=plexaudio&url=" + encodeURIComponent(photo.url) + "&" + plexParams;
            }
            image.onerror = photo_image_error;
            image.setAttribute("src", url);
            image.setAttribute("visibility", "visible");
            photo_timer = setTimeout(request_photo, 20000);
            break;
        case "video":
            show(loading);
            var duration = photo.duration;
            var start = 0;
            if (duration > 60000) {
                start = Math.floor(Math.random() * (duration - 60000)) / 1000; // pick a point to start somewhere in the video
                duration = 60000;
            }
            var url = `${plexUrl}${photo.part_key}?session=plexvideo&${plexParams}#t=${start},${(start+duration)}`;
            video.oncanplay = play_video;
            video.onerror = video_error;
            video.setAttribute("src", url);
            video.setAttribute("visibility", "visible");
            photo_timer = setTimeout(request_photo, duration);
            break;
        default:
            log(`Hmm, shouldn't get here. photo.type = ${photo.type}`, "error");
            photo_timer = setTimeout(request_photo, 1000);
    }
}


/*---------------------------------------------------------------------------------*/
async function start_monitor() {
    screen = "wait";
    add_swipe_events();
    set_wait_div_message("Please wait: retrieving credentials");
    manage_ui();
    start_worker();
    while (1) {
        if (await construct_params())
            break;
        await __delay__(5000);
        set_wait_div_message("Please wait: retrieving credentials");
    }
    set_wait_div_message("Please wait: discovering photos/videos");
    clear_track();
    clear_tabs();
    add_stations();
    while (!worker_discovery_complete) // wait for the photo list to be populated
        await __delay__(5000);
    screen = "photos";
    setInterval(get_plex_status, 2000); // start monitoring for playing audio
    request_photo(); // go display photo slideshow (if no audio playing)
    init_swipes();
}