// JavaScript Document

'use strict';

var plexParams = "";
var photo_list = [];                           // array with all the photos on Plex
var num_photos;
var fetch_flag = false;
var proc_count = 0;

/*---------------------------------------------------------------------------------*/
function print_proc_count() {
  console.log("proc_count = " + proc_count);
}

function __delay__(timer) {
  return new Promise(resolve => {
      timer = timer || 2000;
      setTimeout(function () {
          resolve();
      }, timer);
  });
};

// fetch required resource from url then call function func with the response and additional argument arg
// make it sync as Chromium had problems with it being async
async function call_fetch(url, func, arg) {
  while (fetch_flag) {
    await __delay__(500);
  }
  fetch_flag = true;
  fetch(plexUrl + url, {cache: "no-cache", headers: tokens})
  .then(function(response) {
    fetch_flag = false;
    if(response.ok) {
      response.text().then(function (txt) {func(txt, arg)}, func, arg);
    } else {
      throw new Error('Network response was not "ok".');
    }
  }, func, arg)
  .catch(function(error) {
    fetch_flag = false;
    proc_count--;
    console.log('Worker: There has been a problem fetching ' + url + ': ', error.message);
  });
}

    
/*---------------------------------------------------------------------------------*/
function add_photo_to_list(current_array, key, w, h, updated, added) {
  var item = {"updated": updated, "added": added, "width": w, "height": h, "url": key, "type": "photo"};
  current_array.push(item);
}

function check_video(video_codec, width, height) {
  return (codecs.video.includes(video_codec) && (width <= max_video_resolution.width) && (height <= max_video_resolution.height));
}

function check_audio(audio_codec) {
  return (codecs.audio.includes(audio_codec));
}

function check_video_playability(txt, item) {
  var result = JSON.parse(txt);
  var media = result.MediaContainer.Metadata[0].Media[0];
  var part = media.Part[0];
  if ((result.MediaContainer.mdeDecisionCode == 1000) && (part.key !== undefined) && check_video(media.videoCodec, media.width, media.height) && check_audio(media.audioCodec)) {
    var photo_array = item.array;
    delete item.array;
    item.part_key = part.key;
    item.width = media.width;
    item.height = media.height;
    if (part.size < 50000000) {               // check file size <50M, files too large would take too long to load and seek into
      photo_array.push(item);
    }
  }
  else
    console.log("video not playable\n");
  proc_count--;
}

function check_video_playable(current_array, key, duration, updated, added) {
  var url = "/video/:/transcode/universal/decision?hasMDE=1&mediaIndex=0&partIndex=0&protocol=http&path=" + key;
  var item = {"updated": updated, "added": added, "duration": duration, "url": key, "type": "video", "array": current_array};
  proc_count++;
  call_fetch(url, check_video_playability, item);
}

function add_directory_to_list(current_array, new_array, updated, added, url) {
  var dir = {"updated": updated, "added": added, "list": new_array, "url": url, "type": "dir"};
  current_array.push(dir);
}

// step through a directory listing to find other directories plus photos and videos
function process_dir(txt, current_array) {
  var result;
  try {
    result = JSON.parse(txt);
  } catch {
    console.log("----- Worker: error parsing JSON " + txt);
  }
  var contents = result.MediaContainer.Metadata;
  if (contents !== undefined) {
    for (var i = 0; i < contents.length; i++) {
      var key = contents[i].key;
      if (key.endsWith("/children")) {                 // check if its a directory
        var new_dir = [];
        add_directory_to_list(current_array, new_dir, contents[i].updatedAt, contents[i].addedAt, key);
        find_directory_contents(key, new_dir);
      }
      else
        switch (contents[i].type) {
          case "photo": 
            var media = contents[i].Media;
            if (media !== undefined) {
              var part = media[0].Part;
              if (part !== undefined) {
                key = part[0].key;
                var width = media[0].width;
                var height = media[0].height; 
                var updated = contents[i].updatedAt;
                var added = contents[i].addedAt;
                add_photo_to_list(current_array, key, width, height, updated, added);
              }
            }
            break;
          case "clip":
            var updated = contents[i].updatedAt;
            var added = contents[i].addedAt;
            var duration = contents[i].duration;
            check_video_playable(current_array, key, duration, updated, added);
            break;
          default:
            console.log("------ Worker found unknown content type " + contents[i].type);
        }
    } 
  } else {
    console.log("----- Worker: no Metadata found in " + txt);
  }
  proc_count--;
}

function find_directory_contents(key, current_array) {
  proc_count++;
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
  for (var i = 0; i < dir_list.length; i++) {
    index = dir_list[i];
    if (current_array[index].url == key) {
      dir_list.splice(i, 1);
      return index;
    }
  }
}

function update_dir(txt, current_array) {
  var result;
  try {
    result = JSON.parse(txt);
  } catch {
    console.log("----- Worker: error parsing JSON " + txt);
  }
  var contents = result.MediaContainer.Metadata;
  var previous_dirs = [];
  var previous_photos = [];
  var updated, added, key, match;
  find_previous_dirs(current_array, previous_dirs);
  if (contents !== undefined) {
    for (var i = 0; i < contents.length; i++) {
      key = contents[i].key;
      if (key.endsWith("/children")) {
        updated = contents[i].updatedAt;
        added = contents[i].addedAt;
        match = find_matching_key(current_array, previous_dirs, key);
        if (match !== undefined) {
            current_array[match].updated = updated;
            current_array[match].added = added;
            check_directory_contents(key, current_array[match].list);
        } else {
          var new_dir = [];
          add_directory_to_list(current_array, new_dir, updated, added, key);
          find_directory_contents(key, new_dir);
        }
      }
    }
  } else {
    console.log("----- Worker: no Metadata found in " + txt);
  }
  previous_dirs.forEach(function(item) {
      this.splice(item, 1);                                     // delete all of the other folders not matched above
  }, current_array);
  find_previous_photos(current_array, previous_photos);
  if (contents !== undefined) {
    var width, height, media, part, duration;
    for (var i = 0; i < contents.length; i++) {
      key = contents[i].key;
      if (!key.endsWith("/children")) {
        updated = contents[i].updatedAt;
        added = contents[i].addedAt;
        switch (contents[i].type) {
          case "photo":
            media = contents[i].Media;
            if (media !== undefined) {
              part = media[0].Part;
              if (part !== undefined) {
                key = part[0].key;
                width = media[0].width;
                height = media[0].height; 
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
            break;
          case "clip":
            duration = contents[i].duration;
            match = find_matching_key(current_array, previous_photos, key);
            if (match !== undefined) {
              if ((current_array[match].updated != updated) ||
                  (current_array[match].added != added)) {
                current_array[match].updated = updated;
                current_array[match].added = added;
                current_array[match].duration = duration;
              }
            } else 
              check_video_playable(current_array, key, duration, updated, added);
            break;
          default:
          }
      }
    } 
  }
  previous_photos.forEach(function(item) {
      this.splice(item, 1);                                     // delete all of the other photos not matched above
  }, current_array);
  proc_count--;
}

function check_directory_contents(key, current_array) {
  proc_count++;
  call_fetch(key, update_dir, current_array);
}

// extract the section ID of the photo library from the PMS list (currently assumes only one photo library) and update the photo list
function update_photo_section_id(txt) {
  var result;
  try {
    result = JSON.parse(txt);
  } catch {
    console.log("----- Worker: error parsing JSON " + txt);
  }
  var dirs = result.MediaContainer.Directory;
  if ((dirs !== undefined) && (dirs[0] !== undefined)) {
    for (var i = 0; i < dirs.length; i++) 
      if (dirs[i].type == "photo") {
        var key = dirs[i].key;
        var updated = dirs[i].updatedAt;
        var added = dirs[i].createdAt;
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
  } else {
    console.log("----- Worker: no Directory found in " + txt);
  }
  proc_count--;
}

async function update_photo_list() {
  if (proc_count == 0) {
    console.log("Worker: updating the photo list ****************************");
    proc_count++;
    call_fetch("/library/sections", update_photo_section_id);
    await __delay__(1000);
    while (proc_count > 0)
      await __delay__(1000);
    console.log("Worker: photo list update complete ****************************");
  }
}

function discover_photos() {
  proc_count++;
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

/*---------------------------------------------------------------------------------*/

// plex                 plexworker
//                <--   ready
// params         -->
//                <--   discovery-complete
// photo-request  -->                   | repeat these ...
//                <--   photo           | ... two messages as required

// process message received from the web worker
async function receive(message) {
  console.log("Worker: received message " + message.data.type);
  switch(message.data.type) {
    case "params": 
      plexParams = message.data.data.params;
      tokens = message.data.data.tokens;
      console.log("Worker: starting photo discovery");
      discover_photos();
      await __delay__(5000);
      while (proc_count > 0)          // wait until photo discovery complete
        await __delay__(5000);
      console.log("Worker: discovery complete");
      num_photos = 0;
      count_photos(photo_list);
      postMessage({"type": "discovery-complete", "num_photos": num_photos});
      break;
    case "photo-request": 
      num_photos = 0;
      count_photos(photo_list);
      if (num_photos == 0) {
        postMessage({"type": "photo"});
        console.log("Worker: no photos found when one requested");
        break;
      }
      console.log("Worker: number of photos = " + num_photos);
      postMessage({"type": "photo", "data": find_photo(photo_list, Math.floor(Math.random() * num_photos))});
//      postMessage({"type": "photo", "data": find_photo(photo_list, 1)});
      break;
    default:
      console.log("Worker: unknown message received");
  }
}

/*---------------------------------------------------------------------------------*/

console.log("Worker: hello");
importScripts("custom.js");
onmessage = receive;
postMessage({"type": "ready"});
setInterval(update_photo_list, 3600000);        // periodically check for any new photos
