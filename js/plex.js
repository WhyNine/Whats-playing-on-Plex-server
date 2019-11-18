// JavaScript Document

// Display: 320 x 480

var plexParams = "";
var reqNo = 0;
var activePlayer = "";
var activePlayerTrack = "";
var photo_list = [];                           // array with all the photos on Plex
var num_photos;
var status_fetch = false;
var playing = false;                           // true when music actually playing, false if paused etc
var paused = false;                            // true when music paused
var music_player = false;                      // true if any music player is active, false when photos are displayed
var play_time = Date.now() / 1000;
var tab_data = [];                             // record of player associated with tabs

var parser = new DOMParser();
var serialiser = new XMLSerializer();

var swipe_start = {};                         // starting position of the swipe gesture


/*---------------------------------------------------------------------------------*/
// get authentication token from the Plex server as per https://gitlab.com/media-scripts/apps/blob/d757a26601b2b33c12884a1ff45cf8db690f2fa1/plex/p2/plex_token.py
// function is written synchronously as we can't do anything without the token
async function construct_params() {
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
    var params = JSON.parse(text);
    var authtoken = params.user.authToken;
    if ((authtoken === undefined) || (authtoken.length == 0))       // if can't get a token, bomb out (this will stop the program going any further)
      throw new Error("malformed authentication token");
    tokens.push(["X-Plex-Token", authtoken]);
    tokens.forEach(function(param) {
      if (plexParams.length > 0)
        plexParams += "&";
      plexParams += param[0] + "=" + encodeURIComponent(param[1]);
    });
  } catch {
    console.log('There has been a problem obtaining the authentication token');
  }
}

// add timeout to a promise as per https://stackoverflow.com/a/46946573/11558356
function timeout(ms, promise) {
  return new Promise(function(resolve, reject) {
    setTimeout(function() {
      reject(new Error("timeout"))
    }, ms)
    promise.then(resolve, reject)
  })
}

// fetch required resource from url then call function func with the response and additional argument arg
// add a 10s time-out to all calls
function call_fetch(url, func, arg) {
  timeout(10000, fetch(plexUrl + url, {cache: "no-cache", headers: tokens})).then(function(response) {
    if(response.ok) {
      response.text().then(function (txt) {func(txt, arg)}, func, arg);
    } else {
      throw new Error('Network response was not "ok".');
    }
  }, func, arg)
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
function init_swipes() {
  window.addEventListener('touchstart', record_swipe_start);
  window.addEventListener('touchend', action_swipe_end);
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
  if ((x_diff < 0) && (Math.abs(x_diff) > Math.abs(y_diff)))
    next_player();
  else
    if ((x_diff >= 0) && (Math.abs(x_diff) > Math.abs(y_diff)))
      previous_player();
}


/*---------------------------------------------------------------------------------*/
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

function display_tabs(xmlDoc, apIndex) {
  clear_tabs();
  var tracks = xmlDoc.getElementsByTagName("Track");
  var player, playerState, playerTitle, p;
  var tabs_div = document.getElementById("playing"); 
  for (var i = 0; i < ((tracks.length > 3) ? tracks.length : 3); i++) {
    var tab = document.createElement("div");
    tab.setAttribute("id", "tab" + (i+1));
    tab.setAttribute("tab_index", i);
    if (i < tracks.length) {
      player = tracks[i].getElementsByTagName("Player");
      [p, playerState] = return_player_and_state(tracks[i]);
      tab_data[i] = p;
      playerTitle = player[0].getAttribute("title");           // eg Chrome or Galaxy A5(2017)
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
    if ((x[0] == "content-type") && (x[1].match(/^image/))) 
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
  var trackTitle = track.getAttribute("title");
  document.getElementById("track").innerHTML = trackTitle;
console.log("Track: " + trackTitle);
  var artist = track.getAttribute("grandparentTitle");
  document.getElementById("artist").innerHTML = artist;
console.log("Artist: " + artist);
  var albumTitle = track.getAttribute("parentTitle");
  albumTitle = albumTitle.replace(/(.*?)\[.*?\](.*)/, '$1$2');
  document.getElementById("album").innerHTML = albumTitle;
console.log("Album: " + albumTitle);
  var anim_dur = longest_string([trackTitle, artist, albumTitle])/15;
  anim_dur = (anim_dur < 7) ? 7 : anim_dur;
  document.getElementById("album").style.animationDuration = document.getElementById("track").style.animationDuration = document.getElementById("artist").style.animationDuration = anim_dur.toString() + "s"; 
  var albumArtUrl = track.getAttribute("parentThumb");
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
    var artistArtUrl = track.getAttribute("grandparentThumb");
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
function current_track(xDoc, player) {
  var p, playerState;
  var tracks = xDoc.getElementsByTagName("Track");
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
    console.log("Error in 'current_track', xDoc = " + serialiser.serializeToString(xDoc));
  }
  playing = false;
  paused = false;
  return [-1, ""];
}

function return_current_track_id(cTrack) {
  return (cTrack.getAttribute("grandparentKey") + cTrack.getAttribute("parentKey") + cTrack.getAttribute("title"));
}

// return true if track has changed after comparing grandparent key, parent key and title
function track_changed(cTrack, storedTrack) {
  return (return_current_track_id(cTrack) !== storedTrack);
}

function return_player_and_state(track) {
  try {
    var p = track.getElementsByTagName("Player");
    var s = track.getElementsByTagName("Session");
    return ([p[0].getAttribute("machineIdentifier") + ":" + s[0].getAttribute("id"), p[0].getAttribute("state")]);
  } catch {
    try {
      return (["", p[0].getAttribute("state")]);
    } catch {  
      return(["", ""]);
    }  
  }
}

// look through the list of players and find one that is in the playing state
function find_new_playing_player(xDoc) {
  var tracks = xDoc.getElementsByTagName("Track");
  var p, s;
  try {
    for (var i = 0; i < tracks.length; i++) {                    // find first player that is playing
      [p, s] = return_player_and_state(tracks[i]);
      if (s == "playing")
        return (p);
    }
  } catch {                                                         // get here if no tracks or no session
    console.log("Error in 'select_new_player', xDoc = " + serialiser.serializeToString(xDoc));
  }
  return ("");
}

// look through the list of players and find the first one, regardless of its state
function find_new_player(xDoc) {
  var tracks = xDoc.getElementsByTagName("Track");
  var p, s;
  try {
    for (var i = 0; i < tracks.length; i++) {                    // find first player
      [p, s] = return_player_and_state(tracks[i]);
      return (p);
    }
  } catch {                                                         // get here if no tracks or no session
    console.log("Error in 'select_new_player', xDoc = " + serialiser.serializeToString(xDoc));
  }
  return ("");
}

// check the status from the PMS and decide whether the player is playing or paused or just disappeared (eg closed), find a new player if necessary, else allow the photo slide show to start
function process_status(result) {
  var xmlDoc = parser.parseFromString(result,"text/xml");
  var [activePlayerIndex, currentTrack] = current_track(xmlDoc, activePlayer);
  var player_listed = (activePlayerIndex >= 0);
  var not_playing_time = Date.now()/1000 - play_time;
  var ap;

  hide(document.getElementById("please-wait"));
  
  if ((!player_listed) && (not_playing_time < 6)) {
    music_player = true;
    return;
  }

// Stay with current player if its playing or if its been paused/buffering for under 60s  
  if (((player_listed) && (!playing) && (not_playing_time < 60)) ||
      ((player_listed) && (playing))) {
console.log("Staying with current player");
    music_player = true;
    display_tabs(xmlDoc, activePlayerIndex);
    if (track_changed(currentTrack, activePlayerTrack)) {
      activePlayerTrack = return_current_track_id(currentTrack);
      display_track(currentTrack);
    }
    return;
  }

// Change to a new player if the current player is not listed anymore (for more than 10s) or it hasn't been playing for 60s and there's another player that is    
  if (((!player_listed) && (not_playing_time >= 10) && ((ap = find_new_playing_player(xmlDoc)) != "")) || 
      ((player_listed) && (!playing) && (not_playing_time >= 60) && ((ap = find_new_playing_player(xmlDoc)) != ""))) {
console.log("Changing to a new player");
    music_player = true;
    activePlayer = ap;
    [activePlayerIndex, currentTrack] = current_track(xmlDoc, activePlayer);
    display_tabs(xmlDoc, activePlayerIndex);
    activePlayerTrack = return_current_track_id(currentTrack);
    display_track(currentTrack);
    return;
  }

// Switch to the photos if there are not players listed anymore (for more than 10s) or the current player hasn't been playing for at least 60s  
  if (((!player_listed) && (not_playing_time >= 10) && ((ap = find_new_player(xmlDoc)) == "")) ||
      ((player_listed) && (!playing) && (not_playing_time >= 60) && ((ap = find_new_playing_player(xmlDoc)) == ""))) {
console.log("Nothing to listen to here");
    music_player = false;
    activePlayer = "";
    clear_tabs();
    clear_track();
    activePlayerTrack = "";
    return;
  } 

}

// display the track info with/out pause indication else photo slideshow
function manage_ui() {
  var circles = document.getElementById("circles-div");
  var pause_lines = document.getElementsByClassName("paused")[0];
  var photos = document.getElementById("photos");
  if (playing) {
    play_time = Date.now() / 1000;
  }
  if (music_player) {
    hide(photos);
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
  } else {
    show(photos);
    hide(circles);
    hide(pause_lines);    
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
// this section of the file deals with discovering and updating the list of photos, also selects which photo to display
// note that photos are displayed for 20s, for videos a random 60s portion is played

function add_photo_to_list(current_array, key, w, h, updated, added) {
  var item = {"updated": updated, "added": added, "width": w, "height": h, "url": key, "type": "photo"};
  current_array.push(item);
}

function add_video_to_list(current_array, key, duration, updated, added) {
  var item = {"updated": updated, "added": added, "duration": duration, "url": key, "type": "video"};
  current_array.push(item);
}

function add_directory_to_list(current_array, new_array, updated, added, url) {
  var dir = {"updated": updated, "added": added, "list": new_array, "url": url, "type": "dir"};
  current_array.push(dir);
}

// step through a directory listing to find other directories plus photos and videos
function process_dir(txt, current_array) {
  var xmlDoc = parser.parseFromString(txt,"text/xml");
  var dirs = xmlDoc.getElementsByTagName("Directory");
  if (dirs !== undefined) 
    for (var i = 0; i < dirs.length; i++) 
      if (dirs[i].getAttribute("type") == "photo") {
        var new_dir = [];
        var key = dirs[i].getAttribute("key");
        add_directory_to_list(current_array, new_dir, dirs[i].getAttribute("updatedAt"), dirs[i].getAttribute("addedAt"), key);
        find_directory_contents(key, new_dir);
      }
  var photos = xmlDoc.getElementsByTagName("Photo");
  if (photos !== undefined) 
    for (var i = 0; i < photos.length; i++) {
      var media = photos[i].getElementsByTagName("Media");
      if (media !== undefined) {
        var part = media[0].getElementsByTagName("Part");
        if (part !== undefined) {
          var key = part[0].getAttribute("key");
          var width = media[0].getAttribute("width");
          var height = media[0].getAttribute("height"); 
          var updated = photos[i].getAttribute("updatedAt");
          var added = photos[i].getAttribute("addedAt");
          add_photo_to_list(current_array, key, width, height, updated, added);
        }
      }
    } 
  var videos = xmlDoc.getElementsByTagName("Video");
  if (videos !== undefined) 
    for (var i = 0; i < videos.length; i++) {
      var key = videos[i].getAttribute("key");
      var updated = videos[i].getAttribute("updatedAt");
      var added = videos[i].getAttribute("addedAt");
      var duration = videos[i].getAttribute("duration");
      add_video_to_list(current_array, key, duration, updated, added);
    } 
  }

function find_directory_contents(key, current_array) {
  call_fetch(key, process_dir, current_array);
}

function find_previous_dirs(current_array, dir_list) {
  current_array.forEach(function(item, index) {
    if (item.list) 
      this.push(index);
  }, dir_list);
}

function find_previous_photos(current_array, photo_list) {
  current_array.forEach(function(item, index) {
    if (item.list === undefined) 
      this.push(index);
  }, photo_list);
}

function find_matching_key(current_array, dir_list, key) {
  var index;
  for (i = 0; i < dir_list.length; i++) {
    index = dir_list[i];
    if (current_array[index].url == key) {
      dir_list.splice(i, 1);
      return index;
    }
  }
}

function update_dir(txt, current_array) {
  var xmlDoc = parser.parseFromString(txt,"text/xml");
  var dirs = xmlDoc.getElementsByTagName("Directory");
  var previous_dirs = [];
  var updated, added, key, match;
  find_previous_dirs(current_array, previous_dirs);
  if (dirs !== undefined) 
    for (var i = 0; i < dirs.length; i++) 
      if (dirs[i].getAttribute("type") == "photo") {
        updated = dirs[i].getAttribute("updatedAt");
        added = dirs[i].getAttribute("addedAt");
        key = dirs[i].getAttribute("key");
        match = find_matching_key(current_array, previous_dirs, key);
        if (match !== undefined) {
            current_array[match].updated = updated;
            current_array[match].added = added;
            call_fetch(key, update_dir, current_array[match].list);
        } else {
          var new_dir = [];
          add_directory_to_list(current_array, new_dir, updated, added, key);
          find_directory_contents(key, new_dir);
        }
      }
  previous_dirs.forEach(function(item) {
    this.splice(item, 1);                                     // delete all of the other folders not matched above
  }, current_array);
  var photos = xmlDoc.getElementsByTagName("Photo");
  var previous_photos = [];
  var width, height, media, part;
  find_previous_photos(current_array, previous_photos);
  if (photos !== undefined) 
    for (var i = 0; i < photos.length; i++) {
      media = photos[i].getElementsByTagName("Media");
      if (media !== undefined) {
        part = media[0].getElementsByTagName("Part");
        if (part !== undefined) {
          key = part[0].getAttribute("key");
          width = media[0].getAttribute("width");
          height = media[0].getAttribute("height"); 
          updated = photos[i].getAttribute("updatedAt");
          added = photos[i].getAttribute("addedAt");
          match = find_matching_key(current_array, previous_photos, key);
          if (match !== undefined) {
            if ((current_array[match].updated != updated) ||
                (current_array[match].added != added)) {
              current_array[match].updated = updated;
              current_array[match].added = added;
              current_array[match].width = width;
              current_array[match].height = height;
              current_array[match].url = key;
            }
          } else
            add_photo_to_list(current_array, key, width, height, updated, added);
        }
      }
    } 
    previous_photos.forEach(function(item) {
      this.splice(item, 1);                                     // delete all of the other photos not matched above
    }, current_array);
}

function check_directory_contents(key, current_array) {
  call_fetch(key, update_dir, current_array);
}

// extract the section ID of the photo library from the PMS list (currently assumes only one photo library) and update the photo list
function update_photo_section_id(txt) {
  var xmlDoc = parser.parseFromString(txt,"text/xml");
  var dirs = xmlDoc.getElementsByTagName("Directory");
  if ((dirs !== undefined) && (dirs[0] !== undefined)) 
    for (var i = 0; i < dirs.length; i++) 
      if (dirs[i].getAttribute("type") == "photo") {
        var key = dirs[i].getAttribute("key");
        var updated = dirs[i].getAttribute("updatedAt");
        var added = dirs[i].getAttribute("createdAt");
        if ((photo_list.length == 0) || 
            (updated != photo_list[0].updated) || 
            (added != photo_list[0].added) ||
            (key != photo_list[0].url)) {
          photo_list = [];
          var new_dir = [];
          add_directory_to_list(photo_list, new_dir, updated, added, key);
          find_directory_contents("/library/sections/" + key + "/all", new_dir);
        } else {
          photo_list[0].updated = updated;
          photo_list[0].added = added;
          photo_list[0].url = key;
          check_directory_contents("/library/sections/" + key + "/all", photo_list[0].list)
        }
        break;
      }
  if (photo_list.length == 0)
    console.log("NO PHOTOS DISCOVERED");
  }

function update_photo_list() {
  call_fetch("/library/sections", update_photo_section_id);
}

function discover_photos() {
  call_fetch("/library/sections", update_photo_section_id);
}

// count the number of photos/videos that have been found
function count_photos(current_array) {
  current_array.forEach(function(item) {
    var count = num_photos;
    if (item.list === undefined)
      num_photos++;
    else {
      count_photos(item.list);
      item.count = num_photos - count;        // remember how many photos were found in the directory
    }
  });
}

// find the photo based on the n'th photo in the list
function find_photo(current_array, num) {
  for (var i = 0; i < current_array.length; i++) {
    if (current_array[i].type == "dir") {
      if (current_array[i].count > num)
        return find_photo(current_array[i].list, num);
      else
        num -= current_array[i].count;
    } else {
      if (num == 0)
        return current_array[i];
      else
        num--;
    }
  }
}

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

// if no music playing, select a photo/video to display and display it
async function display_photo() {
  if (music_player) {                                  // if music is playing/active, don't bother updating the photo
    setTimeout(display_photo, 2000);
    return;
  }
  hide(document.getElementById("please-wait"));
  var image = document.getElementById("photo-img");
  var video = document.getElementById("video-img");
  image.setAttribute("visibility", "hidden");
  video.setAttribute("visibility", "hidden");
  num_photos = 0;
  count_photos(photo_list);
  if (num_photos == 0) {
    console.log("Hmm, no photos found ... let's try again");
    photo_list = [];
    discover_photos();
    await __delay__(10000);
    count_photos(photo_list);
    if (num_photos == 0)
      console.log("STILL NO PHOTOS TO DISPLAY");
    image.setAttribute("src", "images/no-photos.png");
    image.setAttribute("visibility", "visible");
    setTimeout(display_photo, 10000);
    return;
  }
  video.setAttribute("src", "");
  var i = Math.floor(Math.random() * num_photos);
  var photo = find_photo(photo_list, i);
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
  await construct_params();
  discover_photos();                              // construct list of available photos
  clear_track();
  clear_tabs();
  await __delay__(10000);                         // wait for things to settle down a bit
  console.log("Starting processes");
  setInterval(get_plex_status, 2000);             // start monitoring for playing audio
  display_photo();                                // go display photo slideshow (if no audio playing)
  init_swipes();
  setInterval(update_photo_list, 3600000);        // periodically check for any new photos
}
