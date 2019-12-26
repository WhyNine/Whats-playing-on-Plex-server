// JavaScript Document

'use strict';

var plexParams = "";
var photo_list = [];                           // array with all the photos on Plex
var num_photos;
var fetch_flag = false;

/*---------------------------------------------------------------------------------*/
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
    console.log('Worker: There has been a problem fetching ' + url + ': ', error.message);
  });
}

    
/*---------------------------------------------------------------------------------*/
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
  var result = JSON.parse(txt);
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
            add_video_to_list(current_array, key, duration, updated, added);
            break;
          default:
        }
    } 
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
  var result = JSON.parse(txt);
  var dirs = result.MediaContainer.Directory;
  var previous_dirs = [];
  var updated, added, key, match;
  find_previous_dirs(current_array, previous_dirs);
  if (dirs !== undefined) 
    for (var i = 0; i < dirs.length; i++) 
      if (dirs[i].type == "photo") {
        updated = dirs[i].updatedAt;
        added = dirs[i].addedAt;
        key = dirs[i].key;
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
  var photos = result.MediaContainer.Photo;
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
  var result = JSON.parse(txt);
  var dirs = result.MediaContainer.Directory;
  if ((dirs !== undefined) && (dirs[0] !== undefined)) 
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

// process message received from the web worker
function receive(message) {
  console.log("Worker: received message " + message.data.type);
  switch(message.data.type) {
    case "params": 
      plexParams = message.data.data.params;
      tokens = message.data.data.tokens;
      console.log("Worker: starting photo discovery");
      discover_photos();
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
