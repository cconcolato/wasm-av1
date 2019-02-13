function concatenateArrayBuffers(buffer1, buffer2) {
  var tmp = new Uint8Array(buffer1.byteLength + buffer2.byteLength);
  tmp.set(new Uint8Array(buffer1), 0);
  tmp.set(new Uint8Array(buffer2), buffer1.byteLength);
  return tmp.buffer;
};

var saveByteArray = (function () {
    var a = document.createElement("a");
    document.body.appendChild(a);
    a.style = "display: none";
    return function (data, name) {
        var blob = new Blob(data, {type: "octet/stream"}),
            url = window.URL.createObjectURL(blob);
        a.href = url;
        a.download = name;
        a.click();
        window.URL.revokeObjectURL(url);
    };
}());

function AVIFItemsToIVF(mp4boxfile, ivfCallback) {
	var items = mp4boxfile.items;
	var ivfs = [];
	for (var i in items) {
		var item = items[i];
		if (item.type === "av01") {
			ivfs.push(AVIFItemToIVF(item));
		}
	}
	ivfCallback(ivfs);
}

function AVIFItemToIVF(item) {
	//console.log(item.data.buffer);
	var ivfHeaderSize = 32;
	var signature = 'DKIF';
	var codec = 'AV01';
	var ispe = item.properties.ispe;
	var width = ispe.image_width;
	var height = ispe.image_height;
	var frameRate = 24;
	var timescale = 24;
	var nbFrames = 2;
	var widthHighByte = width >> 8;
	var widthLowByte = width - (widthHighByte << 8);
	var heightHighByte = height >> 8;
	var heightLowByte = height - (heightHighByte << 8);
	var obuTdSize = 2;
	var frameSize = item.data.buffer.byteLength + obuTdSize;
	var frameSizeBytes = [];
	frameSizeBytes[0] = (frameSize >> 24) & 0xFF;
	frameSizeBytes[1] = (frameSize >> 16) & 0xFF;
	frameSizeBytes[2] = (frameSize >> 8) & 0xFF;
	frameSizeBytes[3] = frameSize & 0xFF;
	var ivfBuffer = new Uint8Array([
		// IVF HEADER
		signature.charCodeAt(0), 	// bytes 0-3    signature: 'DKIF'
		signature.charCodeAt(1),
		signature.charCodeAt(2),
		signature.charCodeAt(3),
		0,		// bytes 4-5    version (should be 0)
		0,
		ivfHeaderSize,		// bytes 6-7    length of header in bytes
		0,
		codec.charCodeAt(0),	// bytes 8-11   codec FourCC (e.g., 'VP80')
		codec.charCodeAt(1),
		codec.charCodeAt(2),
		codec.charCodeAt(3),
		widthLowByte, // bytes 12-13  width in pixels
		widthHighByte,
		heightLowByte, // bytes 14-15  height in pixels
		heightHighByte,
		frameRate, // bytes 16-19  frame rate
		0,
		0,
		0,
		timescale, // bytes 20-23  time scale
		0,
		0,
		0,
		nbFrames,  //bytes 24-27  number of frames in file
		0,
		0,
		0,
		0, // bytes 28-31  unused
		0,
		0,
		0
	]);
	var frameBuffer = new Uint8Array([
		// FRAME HEADER
		frameSizeBytes[3], // bytes 0-3    size of frame in bytes (not including the 12-byte header)
		frameSizeBytes[2],
		frameSizeBytes[1],
		frameSizeBytes[0],
		0, // bytes 4-11   64-bit presentation timestamp
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0x12, // OBU TD
		0	  // OBU TD
	]);
	var fullFrameBuffer = concatenateArrayBuffers(frameBuffer, item.data.buffer);
	var fullBuffer = concatenateArrayBuffers(ivfBuffer, fullFrameBuffer);
	//saveByteArray([fullBuffer], 'example.ivf');
	return {
		high_bitdepth: item.properties.pixi.bits_per_channels[0] === 10,
		buffer: fullBuffer
	};
}

function parseAVIFFile(fileobj, ivfCallback) {
	var chunkSize = 1024*1024;
    var fileSize   = fileobj.size;
    var offset     = 0;
    var self       = this; // we need a reference to the current object
    var readBlock  = null;

	var mp4boxfile = MP4Box.createFile(false);

	mp4boxfile.onError = function(e) {
		console.log("Failed to parse AVIF data");
	};

    var onparsedbuffer = function(buffer) {
    	console.log("Appending buffer with offset "+offset);
		buffer.fileStart = offset;
    	mp4boxfile.appendBuffer(buffer);
	}

	var onBlockRead = function(evt) {
        if (evt.target.error == null) {
            onparsedbuffer(evt.target.result); // callback for handling read chunk
            offset += evt.target.result.byteLength;
        } else {
            console.log("Read error: " + evt.target.error);
            return;
        }
        if (offset >= fileSize) {
            console.log("Done reading file ("+fileSize+ " bytes)");
			mp4boxfile.flush();
			// success
			AVIFItemsToIVF(mp4boxfile, ivfCallback);
            return;
        }

        readBlock(offset, chunkSize, fileobj);
    }

    readBlock = function(_offset, length, _file) {
        var r = new FileReader();
        var blob = _file.slice(_offset, length + _offset);
        r.onload = onBlockRead;
        r.readAsArrayBuffer(blob);
    }

    readBlock(offset, chunkSize, fileobj);
}