// grab all the canvas prototypes we might need, comixology likes to stub some of them over
var toDataURL = HTMLCanvasElement.prototype.toDataURL;
var getContext = HTMLCanvasElement.prototype.getContext;
var drawImage = CanvasRenderingContext2D.prototype.drawImage;

// quick-n-dirty versions of underscore.js functions
function range(start, end) {
  var ret = [];
  for (var i = start; i < end; i++) {
    ret.push(i);
  }
  return ret;
}

function unique(arr) {
  return arr.reverse().filter(function (e, i, arr) {
    return arr.indexOf(e, i+1) === -1;
  }).reverse();
}

function object(keys, vals) {
  var ret = {};
  for (var i = 0; i < keys.length && i < vals.length; i++) {
    ret[keys[i]] = vals[i];
  }
  return ret;
}

var metadata;
var seriesid;
var itemid;

// watch for nodes and grab the metadata before the page tries to hide it
// (we could just use the jQuery object but it looks like they try to hide $ so jQuery being exposed is probably an oversight)
var observer = new MutationObserver(function(mutations) {
  for (var i = 0; i < mutations.length; i++) {
    mutation = mutations[i];
    if (mutation.target.id == "reader") {
      observer.disconnect();
      observer = null;
      metadata = parseMetadataJson(mutation.target.getAttribute("data-metadata"));
      window.metadata = metadata;
      seriesid = mutation.target.getAttribute("data-seriesid");
      itemid = mutation.target.getAttribute("data-itemid");
      insert_button();
      return;
    }
  }
});

observer.observe(document.documentElement, { childList: true, subtree: true });

document.addEventListener("DOMContentLoaded", function() {
  if (observer) {
    // reader document not found, clean up our observer and silently fail
    observer.disconnect();
    observer = null;
  }
}, false);

function loadImage(url, cb) {
  GM_xmlhttpRequest({
    method: "GET",
    url: url,
    onload: function(res) { cb(res.responseText); },
    onerror: function() { cb(null); }
  });
}

function panelId(panel) {
  return [seriesid, (+panel + 2), itemid].join("");
}

function insert_button() {
  var btn = document.createElement("button");
  btn.textContent = "Download";
  btn.style.position = "absolute";
  btn.style.top = 0;
  btn.style.left = 0;
  btn.style.background = "white";
  btn.style.zIndex = 999;
  btn.onclick = doDownload;
  document.body.appendChild(btn);
}

function doDownload() {
  var done = 0;
  var todo = metadata.book_info.pages.length;
  var errors = [];
  var zip = new JSZip();

  save = function() {
    var content = zip.generate({ type: "blob" });
    if (errors.length) {
      alert("Errors saving the following pages: " + JSON.stringify(errors));
    }
    saveAs(content, "book.cbz");
  };

  for (var i = 0; i < metadata.book_info.pages.length; i++) {
    /*jshint -W083 */
    (function(panel) {
      var filename = (panel.length == 1 ? "0" + panel : panel) + ".jpg";
      var page = metadata.book_info.pages[panel];
      var imgData = page.descriptor_set.image_descriptors[1];
      var id = panelId(panel);

      loadImage(imgData.uri + "&s=" + id, function(data) {
        if (data) {
          if (!data) {
            errors.push(filename);
            console.log("error saving " + filename);
            done++;
            if (done == todo) {
              save();
            }
          }

          decodeImage(data, id, imgData, function(url) {
            if (url) {
              zip.file(filename, url.substr(url.indexOf(',') + 1), { base64: true });
              console.log("saved " + filename);
            } else {
              errors.push(filename);
              console.log("error saving " + filename);
            }
            done++;
            if (done == todo) {
              save();
            }
          });
        }
      });
    })(Number(i).toString());
  }

}