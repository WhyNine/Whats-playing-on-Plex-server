// JavaScript Document

// Display: 320 x 480

'use strict';

var plexParams = "";
var reqNo = 0;
var activePlayer;
var activePlayerTrack = "";
var photo_list = [];                           // array with all the photos on Plex
var num_photos;
var status_fetch = false;
var playing = false;                           // true when music actually playing, false if paused etc
var paused = false;                            // true when music paused
var screen = "wait";                           // can be either "wait", "photos", "music" or "stations"
var play_time = Date.now() / 1000;
var tab_data = [];                             // record of player associated with tabs

var swipe_start = {};                          // starting position of the swipe gesture
var swipe_functions = {"up": undefined, "down": undefined, "left": undefined, "right": undefined};

var worker;
var worker_ready = false;

var radio_stations = [
  { file: "iframe-bbc-4.html", logo_type: "jpg", url: "bbc-radio-4" },
  { file: "iframe-bbc-2.html", logo_type: "jpg", url: "bbc-radio-2" },
  { file: "iframe-breeze.html", logo_type: "jpg", url: "the-breeze" },
  { file: "iframe-absolute-80s.html", logo_type: "png", url: "absolute-80s" },
  { file: "iframe-gold.html", logo_type: "jpg", url: "gold" },
  { file: "iframe-magic.html", logo_type: "jpg", url: "magic-radio" }
];
var radio = false;                          // true when displaying the radio page


/*---------------------------------------------------------------------------------*/
// get authentication token from the Plex server as per https://gitlab.com/media-scripts/apps/blob/d757a26601b2b33c12884a1ff45cf8db690f2fa1/plex/p2/plex_token.py
// function is written synchronously as we can't do anything without the token
async function construct_params() {
  var params;
  var encoded = "Basic " + btoa(plex_username + ":" + plex_password);
  var new_tokens = tokens.slice();
  new_tokens.push(['Authorization', encoded]);
  try {
    var fetch_response = await fetch("https://plex.tv/users/sign_in.json",     // request toekn from Plex server
        {method: "POST", 
         cache: "no-cache", 
         headers: new_tokens});
    if (!fetch_response.ok)
      throw new Error("not ok");
    var text = await fetch_response.text();
    try {
      params = JSON.parse(text);
    }   
    catch (err) {
      console.log("---- Error parsing authorisation response " + text);
    }  
    var authtoken = params.user.authToken;
    if ((authtoken === undefined) || (authtoken.length == 0))       // if can't get a token, bomb out (this will stop the program going any further)
      throw new Error("malformed authentication token");
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
      worker.postMessage({"type": "params", "data": {"params": plexParams, "tokens": tokens}});
      console.log("Sent params to worker");
    }
  } catch {
    console.log('There has been a problem obtaining the authentication token');
    document.getElementById("please-wait-p").innerText = "Auhentication error";
  }
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
function call_fetch(url, func, arg) {
  timeout(10000, fetch(plexUrl + url, {cache: "no-cache", headers: tokens}).then(function(response) {
    if(response.ok) {
      response.text().then(function (txt) {func(txt, arg)}, func, arg);
    } else {
      throw new Error('Network response was not "ok".');
    }
  }), func, arg)
  .catch(function(error) {
    console.log('There has been a problem fetching ' + url + ': ', error.message);
  });
}

function __delay__(timer) {
  return new Promise(resolve => {
      timer = timer || 2000;
      setTimeout(function () {
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
  arr.sort((a,b) => a.length > b.length);
  return getTextWidth(arr[0], "Calibri");
}

function checkOverflow(el)
{
   var curOverflow = el.style.overflow;
   if ( !curOverflow || curOverflow === "visible" )
      el.style.overflow = "hidden";
   var isOverflowing = el.clientWidth < el.scrollWidth 
                    || el.clientHeight < el.scrollHeight;
   el.style.overflow = curOverflow;
   return isOverflowing;
}
    
/*---------------------------------------------------------------------------------*/
function start_worker() {
  if (typeof(Worker) !== "undefined") {
    worker = new Worker("js/plex_worker.js");
    worker.onmessage = receive_message;
  } else {
    console.log("No Web Worker support!!");
  }
}

function init_swipes() {
  window.addEventListener('touchstart', record_swipe_start);
  window.addEventListener('touchend', action_swipe_end);
  swipe_functions.left = function() {next_player()};
  swipe_functions.right = function() {previous_player()};
  swipe_functions.up = function() {show_radio()};
}

function record_swipe_start(event) {
  var touchobj = event.changedTouches[0];
  swipe_start = {"x": touchobj.clientX, "y": touchobj.clientY};
  console.log("Touch start: " + touchobj.clientX + ", " + touchobj.clientY);
}

function action_swipe_end(event) {
  var touchobj = event.changedTouches[0];
  console.log("Touch end:" + touchobj.clientX + ", " + touchobj.clientY);
  var x_diff = touchobj.clientX - swipe_start.x;
  var y_diff = touchobj.clientY - swipe_start.y;
  if ((Math.abs(x_diff) < 50) && Math.abs(y_diff) < 50) {
    return;
  }
  if (Math.abs(x_diff) > Math.abs(y_diff)) {                  // left/right
    if (x_diff < 0) {
      if (swipe_functions.left != undefined) {swipe_functions.left();}
    } else
    if (swipe_functions.right != undefined) {swipe_functions.right();};
  } else {                                                    // up/down
    if (y_diff < 0) {
      if (swipe_functions.up != undefined) {swipe_functions.up();}
    } else
    if (swipe_functions.down != undefined) {swipe_functions.down();};
  }
}


/*---------------------------------------------------------------------------------*/
function show_radio() {
  screen = "radio";
  swipe_functions.left = undefined;
  swipe_functions.right = undefined;
  swipe_functions.up = undefined;
  swipe_functions.down = function() {hide_radio()};
  manage_ui();
}

function hide_radio() {
  screen = "photos";
  remove_playing_station();
  manage_ui();
  swipe_functions.left = function() {next_player()};
  swipe_functions.right = function() {previous_player()};
  swipe_functions.up = function() {show_radio()};
  swipe_functions.down = undefined;
}

function add_station(args) {
  timeout(10000, fetch(args.station.file, {cache: "no-cache", method: "HEAD"}).then(function(response) {
    if(response.ok) {
      var stations_div = document.getElementById("radio-stations");
      var new_img = document.createElement("img");
      new_img.index = args.index;
      new_img.onclick = select_station;
      new_img.setAttribute("class", "radio-station-img");
      new_img.src = "https://radio2you.co.uk/public/uploads/radio_img/" + args.station.url + "/play_250_250." + args.station.logo_type;
      stations_div.appendChild(new_img);
    } else {
      throw new Error('Network response was not "ok".');
    }
  }), args)
  .catch(function(error) {
    console.log('There has been a problem fetching ' + args.station.file + ': ', error.message);
  });
}

function add_stations() {
  var i;
  for (i = 0; i < radio_stations.length; i++) {
    add_station({index: i, station: radio_stations[i]});
  }
}

function remove_playing_station() {
  remove_all_children(document.getElementById("radio-playing"));
}

// radio2you uses https which means the server requires TLS support (else use localhost)
function select_station() {
  var station = radio_stations[this.index];
  var playing_div = document.getElementById("radio-playing");
  remove_playing_station();
  var new_iframe = document.createElement("iframe");
  new_iframe.src = station.file;
  new_iframe.setAttribute("class", "radio-playing-iframe");
  playing_div.appendChild(new_iframe);
}

/*---------------------------------------------------------------------------------*/
function update_progress_bar(track) {
  var bar = document.getElementById("progress-bar");
  try {
    bar.style.width = (100 * track.viewOffset / track.duration) + "%";
  } catch(err) {
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
  var tabs = document.getElementsByClassName("tabs");           // find all the player tabs being displayed
  var i = 0;
  while (tabs[i].getAttribute("class") != "active-tab tabs") 
    i++;
  if ((i < 2) && (tabs[i+1].getAttribute("class") == "inactive-tab tabs")) {
    activePlayer = tab_data[tabs[i+1].attributes.tab_index.nodeValue];
    console.log("Changed to next player");
  }
}

// called on swipe right to change to previous player tab (if one exists)
function previous_player() {
  var tabs = document.getElementsByClassName("tabs");           // find all the player tabs being displayed
  var i = 0;
  while (tabs[i].getAttribute("class") != "active-tab tabs") 
    i++;
  if ((i > 0) && (tabs[i-1].getAttribute("class") == "inactive-tab tabs")) {
    activePlayer = tab_data[tabs[i-1].attributes.tab_index.nodeValue];
    console.log("Changed to previous player");
  }
}

function display_tabs(tracks) {
  clear_tabs();
  var player, playerState, playerTitle, p;
  var tabs_div = document.getElementById("playing"); 
  for (var i = 0; i < ((tracks.length > 3) ? tracks.length : 3); i++) {
    var tab = document.createElement("div");
    tab.setAttribute("id", "tab" + (i+1));
    tab.setAttribute("tab_index", i);
    if (i < tracks.length) {
      player = tracks[i].Player;
      [p, playerState] = return_player_and_state(tracks[i]);
      tab_data[i] = p;
      playerTitle = player.title;           // eg Chrome or Galaxy A5(2017)
      tab.innerHTML = playerState + " on " + playerTitle;
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
    var tab = document.getElementById("tab" + (i+1));
    while (checkOverflow(tab)) {
      if (font < 8)
        break;
      font -= 0.5;
      tab.style.fontSize = font + "px";
    }
  }
}

// check whether the HTTP headers indicate that an image was returned or not
function image_returned (headers) {
  var x;
  for(x of headers.entries()) 
    if ((x[0].toLowerCase() == "content-type") && (x[1].match(/^image/))) 
      return true;
  return false; 
}

// fetch image then add it to the DOM
function addImage(cl, url) {
  fetch(url, {method: "GET", headers: tokens})
  .then(function(response) {
    if ((response.ok) && (image_returned(response.headers) == true)) {
      response.blob().then (function(blob) {
        var img = document.createElement("img");
        img.onerror = function(event) {image_error(event);};
        img.cl = cl;
        img.onload = update_image;
        img.setAttribute("src", URL.createObjectURL(blob));
      });
    } else
      console.log('There has been a problem with fetching ' + url);
  }).catch(function(error) {
    console.log('There has been a problem with fetching ' + url);
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
function image_error() {
  console.log("image error " + event.target.src);
  event.target.onerror = null;
  event.target.src = "images/no_image.png";
}

function display_track(track) {
  var trackTitle = track.title;
  document.getElementById("track").innerHTML = trackTitle;
//console.log("Track: " + trackTitle);
  var artist = track.grandparentTitle;
  document.getElementById("artist").innerHTML = artist;
//console.log("Artist: " + artist);
  var albumTitle = track.parentTitle;
  albumTitle = albumTitle.replace(/(.*?)\[.*?\](.*)/, '$1$2');
  document.getElementById("album").innerHTML = albumTitle;
//console.log("Album: " + albumTitle);
  var anim_dur = longest_string([trackTitle, artist, albumTitle])/15;
  anim_dur = (anim_dur < 7) ? 7 : anim_dur;
  document.getElementById("album").style.animationDuration = document.getElementById("track").style.animationDuration = document.getElementById("artist").style.animationDuration = anim_dur.toString() + "s"; 
  var albumArtUrl = track.parentThumb;
  // check if there is album art, else display something anyway
  if (albumArtUrl !== null){
    albumArtUrl = plexUrl + albumArtUrl;
    addImage("album-art", albumArtUrl);
  } else {
    var img = document.createElement("img");
    img.setAttribute("src", "images/no_image.png");
    remove_child(document.getElementById("album-art"));
    document.getElementById("album-art").appendChild(img);
  }
  // check if the artist is Soundtrack (usually found on albums from movies), if so display something sensible
  if (artist === "Soundtrack") {
    var img = document.createElement("img");
    img.setAttribute("src", "images/soundtrack.jpg");
    remove_child(document.getElementById("artist-art"));
    document.getElementById("artist-art").appendChild(img);
  } else {
    var artistArtUrl = track.grandparentThumb;
    if (artistArtUrl !== null){
      artistArtUrl = plexUrl + artistArtUrl;
      addImage("artist-art", artistArtUrl);
    } else {
      var img = document.createElement("img");
      img.setAttribute("src", "images/no_image.png");
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
  } catch {                                                                 // get here if no tracks or no session
    console.log("Error in 'current_track', tracks = " + JSON.stringify(tracks));
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
      return(["", ""]);
    }  
  }
}

// look through the list of players and find one that is in the playing state
function find_new_playing_player(tracks) {
  var p, s;
  try {
    for (var i = 0; i < tracks.length; i++) {                    // find first player that is playing
      [p, s] = return_player_and_state(tracks[i]);
      if (s == "playing")
        return (p);
    }
  } catch {                                                         // get here if no tracks or no session
    console.log("Error in 'select_new_player', tracks = " + JSON.stringify(tracks));
  }
  return ("");
}

// look through the list of players and find the first one, regardless of its state
function find_new_player(tracks) {
  var p, s;
  try {
    for (var i = 0; i < tracks.length; i++) {                    // find first player
      [p, s] = return_player_and_state(tracks[i]);
      return (p);
    }
  } catch {                                                         // get here if no tracks or no session
    console.log("Error in 'select_new_player', tracks = " + JSON.stringify(tracks));
  }
  return ("");
}

// check the status from the PMS and decide whether the player is playing or paused or just disappeared (eg closed), find a new player if necessary, else allow the photo slide show to start
function process_status(result) {
  var status;
  if (screen == "radio") {
    return;
  }
  try {
    status = JSON.parse(result);
  } 
  catch (err) {
    console.log("---- Error parsing PWS status " + result);
  }
  var tracks = [];
  if (status.MediaContainer.Metadata !== undefined) 
    tracks = status.MediaContainer.Metadata;
  if (activePlayer === undefined) {                   // this must be app starting
    activePlayer = find_new_player(tracks);
  }
  var [activePlayerIndex, currentTrack] = current_track(tracks, activePlayer);
  var player_listed = (activePlayerIndex >= 0);
  var not_playing_time = Date.now()/1000 - play_time;
  var ap;

  if ((!player_listed) && (not_playing_time < 6)) {
    screen = "music";
    manage_ui();
    return;
  }

// Stay with current player if its playing or if its been paused/buffering for under 60s  
  if (((player_listed) && (!playing) && (not_playing_time < 60)) ||
      ((player_listed) && (playing))) {
//console.log("Staying with current player");
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
//console.log("Changing to a new player");
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
//console.log("Nothing to listen to here");
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
  switch(screen) {
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
}

// get the status of the PMS
function get_plex_status() {
  manage_ui();
  if (status_fetch)
    return;
  status_fetch = true;
  call_fetch("/status/sessions", process_status);
  status_fetch = false;
}

/*---------------------------------------------------------------------------------*/

function photo_image_error(event) {
  console.log("Display photo error " + event.target.src);
}

// start playing the video once it has reached the state canplay
function play_video(event) {
  video = event.target;
  video.oncanplay = null;
  var timer = setInterval(function() {
    if (video.paused && video.readyState == 4 || !video.paused) {
      video.play()
      .then(function(response) {
        console.log("playing video " + video.getAttribute("src"));
      }).catch(function(error) {
        console.log('There has been a problem with starting playback of the video: ' + error.message);
      });
      clearInterval(timer);
    }       
  }, 50);
}

function video_error(event) {
  event.target.onerror = null;
  console.log("Error playing video from " + event.target.getAttribute("src") + ": " + event.type);
  switch (event.target.error.code) {
    case event.target.error.MEDIA_ERR_ABORTED:
      console.log('You aborted the video playback.');
      break;
    case event.target.error.MEDIA_ERR_NETWORK:
      console.log('A network error caused the video download to fail part-way.');
      break;
    case event.target.error.MEDIA_ERR_DECODE:
      console.log('The video playback was aborted due to a corruption problem or because the video used features your browser did not support.');
      break;
    case event.target.error.MEDIA_ERR_SRC_NOT_SUPPORTED:
      console.log('The video could not be loaded, either because the server or network failed or because the format is not supported.');
      break;
    default:
      console.log('An unknown error occurred.');
      break;
  }
}

// request photo from worker
function display_photo() {
  worker.postMessage({"type": "photo-request"});
}

// if no music playing, display a photo/video
function receive_message(event) {
  console.log("Message received from worker: " + event.data.type);
  switch (event.data.type) {
    case "ready":
      worker_ready = true;
      break;
    case "photo":
      receive_photo(event.data.data);
      break;
    default:
  }
}

function receive_photo(photo) {
  if (screen != "photos") {                                  // if music or radio is playing/active, don't bother updating the photo
    setTimeout(display_photo, 2000);
    return;
  }
  manage_ui();
  var image = document.getElementById("photo-img");
  var video = document.getElementById("video-img");
  image.setAttribute("visibility", "hidden");
  video.setAttribute("visibility", "hidden");
  if (photo == undefined) {
    console.log("Hmm, no photos found ... ");
    image.setAttribute("src", "images/no-photos.png");
    image.setAttribute("visibility", "visible");
    setTimeout(display_photo, 10000);
    return;
  }
  video.setAttribute("src", "");
  console.log("Displaying photo/video " + photo.url);
  switch (photo.type) {
    case "photo":           // use the PMS transcoder to scale it to the right size and rotate it if necesary at the same time
      var url = plexUrl + "/photo/:/transcode?width=480&height=320&minSize=1&url=" + encodeURIComponent(photo.url) + "&" + plexParams;
      image.onerror = photo_image_error;
      image.setAttribute("src", url);
      image.setAttribute("visibility", "visible");
      setTimeout(display_photo, 20000);
      break;
    case "video":         // use the PMS transcoder to scale it to fit and change the codec to AVC (which Chrome can play)
      var url;
      var duration = photo.duration;
      var start = 0;
      if (duration > 60000) {
        start = Math.floor(Math.random() * (duration - 60000)) / 1000;   // pick a point to start somewhere in the video
        duration = 60000;
      }
      url = plexUrl + "/video/:/transcode/universal/start.mp4?path=" + encodeURI(photo.url) + "&mediaIndex=0&partIndex=0&protocol=http&offset=" + start + "&fastSeek=1&directPlay=0&directStream=1&videoQuality=50&videoResolution=480x320&maxVideoBitrate=2000&subtitleSize=100&audioBoost=100&" + plexParams;  // %2Flibrary%2Fmetadata%2F23654
      video.setAttribute("src", url);
      video.setAttribute("visibility", "visible");
      video.oncanplay = play_video;
      video.onerror = video_error;
      setTimeout(display_photo, duration);
      break;
    default:
      console.log("Hmm, shouldn't get here. photo.type = " + photo.type);
      setTimeout(display_photo, 1000);
  }
}


/*---------------------------------------------------------------------------------*/
async function start_monitor() {
  screen = "wait";
  manage_ui();
  start_worker();
  await construct_params();
  clear_track();
  clear_tabs();
  add_stations();
  setInterval(get_plex_status, 2000);             // start monitoring for playing audio
  screen = "photos";
  display_photo();                                // go display photo slideshow (if no audio playing)
  init_swipes();
}
