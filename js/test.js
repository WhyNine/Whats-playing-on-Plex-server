var tokens = [["X-Plex-Product", "Plex monitor"], 
              ["X-Plex-Version", "1.0"], 
              ["X-Plex-Client-Identifier", "touch-screen"]];

var plexUrl = "http://touch-screen:32400";


function construct_params() {
    var str;
    for (key in tokens) {
      str = key + "=" + encodeURIComponent(tokens[key]);
      if (plexParams.length > 0)
        plexParams += "&";
      plexParams += str;
    }
  }

function end_game(txt) {
    console.log(txt);
}

function get_token() {
    auth();
}

function discover_photos() {
    call_fetch("/library/sections", end_game);
  }

  function call_fetch(url, func, arg) {
    fetch(plexUrl + url, {cache: "no-cache", headers: tokens}).then(function(response) {
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
  

function auth() {
    var username = "waller_as@yahoo.co.uk";
    var password = "OkLHU8u65Ko3i3HDYXzD";
    var encoded = "Basic " + btoa(username + ":" + password);
    var url = "https://plex.tv/users/sign_in.json";
    var new_tokens = tokens.slice();
    new_tokens.push(['Authorization', encoded]);
    fetch(url, {method: "POST", 
                cache: "no-cache", 
                headers: new_tokens})
    .then(function(response) {
        response.text()
        .then(function(text) {
            var params = JSON.parse(text);
            tokens.push(["X-Plex-Token", params.user.authToken]);
            discover_photos();
        })
    });
}