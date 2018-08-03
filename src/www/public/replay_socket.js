//var io = require('socket.io-client');

// TODO: make server/port dynamic
var socket = io.connect('http://localhost:3000', {secure: false, reconnect: true, rejectUnauthorized: false});
//var path = require('path').posix

//let socket = io();
let fileContents = []
let runTo = 0;

//const readline = require('readline');
//const fs = require('fs');
let counter = 1; // counter for sent packets
let lineToSend = 1; // which line/packet will be sent next
let totalPackets = 0;

let allLines = []
let replayTimer;

$("#the-file-input").change(function () {
    // will log a FileList object
    console.log(this.files);
});

let input = function (done) {


}

const reader = new FileReader()

var rawLines;
var lines = []

function myFunction() {
    var x = document.getElementById("myFile");
    var txt = "";

    // if (x !== null) {
    if ('files' in x) {
        if (x.files.length === 0) {
            txt = "Select one or more files.";
        } else {
            for (var i = 0; i < x.files.length; i++) {
                console.log('file: ', i + 1)
                var file = x.files[i];
                if ('name' in file) {
                    console.log("name: " + file.name);
                }
                if ('size' in file) {
                    console.log("size: " + file.size);
                }

            }
            reader.readAsText(x.files[0])

        }
    }
    else {
        if (x.value === "") {
            txt += "Select one or more files.";
        } else {
            txt += "The files property is not supported by your browser!";
            txt += "<br>The path of the selected file: " + x.value; // If the browser does not support the files property, it will return the path of the selected file instead.
        }
    }
    //   }

    //document.getElementById("demo").innerHTML = txt;
    // $('#packets').html(txt)
}


reader.onload = (event) => {
    const file = event.target.result;
    let rawLines = file.split(/\r\n|\n/);

    //console.log(allLines)
    // Reading line by line
    rawLines.forEach((line) => {
        if (line) {
            allLines.push(JSON.parse(line))

        }


    });


    allLines.forEach((line) => {
        totalPackets++
        line.counter = totalPackets;
        let tempEl;
        if (line.type === 'packet') {
            tempEl = $('<td/>')
                .append(line.packet.toString())
        }
        else {
            tempEl = $('<td/>')
                .append(line.url)
        }
        $('#tableBody')
            .append($('<tr/>')
                .attr("row", line.counter)
                .append($('<td/>')
                    .css('width', '75px')

                    .append($('<button>').append($('<i>').addClass('fas').addClass('fa-angle-right'))))

                .append($('<td/>')
                    .css('width', '50px')
                    .append(line.counter))

                .append($('<td/>')
                    .css('width', '100px')

                    .append(line.direction))
                .append($('<td/>')
                    .css('width', '100px')

                    .append(line.type))
                .append(tempEl))


    })



    $('#packetCount').val("0 of " + totalPackets)
    bindBtnEvent()
    setTableScroll()
    //totalPackets = counter
}

var setTableScroll = function() {
    // set table scrolling height
    var windowHeight = $(window).height()
    var positionTable = $('#packets').offset().top
    var positionTBody = $('#tableBody').offset().top
    var tableSize = windowHeight-positionTable
    var tbodySize = windowHeight-positionTBody
    $('#packets').css('height', tableSize)
    $('#tableBody')
        .css('overflow-y', 'scroll')
        .css('height', tbodySize)
        .css('width', '100%')
        .css('position', 'absolute')


}

var init = function () {

    // bind event for window size change
    $( window ).resize(function() {
        setTableScroll()
    });

    $('#resetButton').on('click', function () {
        var x = document.getElementById("myFile");
        runTo = 0;
        counter = 1; // counter for sent packets
        lineToSend = 1; // which line/packet will be sent next
        totalPackets = 0;
        $('#packets tbody').html('')

        // stop replay if in progress
        if ($('#replayButton').hasClass('btn-success')){
            $('#replayButton').click()
        }

        reader.readAsText(x.files[0])


    })

    $('#replayButton').on('click', function () {
        if ($('#replayButton').hasClass('btn-primary')) {
            if (totalPackets !== null) {

                $('#replayButton').addClass('btn-success').removeClass('btn-primary')
                $('#replayButton').text('Replaying...')
                replayTimer = setInterval(function () {
                    if (allLines[lineToSend].type === 'packet' && lineToSend <= totalPackets) {
                        socket.emit('receivePacketRaw', [allLines[lineToSend].packet])
                        console.log('sending #%s %s', lineToSend, allLines[lineToSend].packet.toString())
                    }
                    else if (allLines[lineToSend].type !== 'packet') {
                        console.log('Skipping packet %s', lineToSend)
                    }
                    else {
                        $('#replayButton').addClass('btn-primary').removeClass('btn-success')
                        $('#replayButton').text('Replay')
                        clearTimeout(replayTimer)

                    }
                    $('*[row="' + lineToSend + '"] td').first().html($('<button>').prop('disabled', 'disabled').append($('<i>').addClass('fas').addClass('fa-angle-down')))
                    $('#packetCount').val(lineToSend + " of " + totalPackets)
                    lineToSend++
                }, 500)
            }
            else {
                console.log('No packets to send yet')
            }


        }
        else {
            $('#replayButton').addClass('btn-primary').removeClass('btn-success')
            $('#replayButton').text('Replay')
            clearTimeout(replayTimer)

        }
        console.log('replay button clicked')
        console.log('replay timer? ', replayTimer)

    })


}

function bindBtnEvent() {
    $('#packets button').bind('click', function (event) {

        console.log('user clicked: ' + $(event.target).closest('tr').attr('row'))
        runTo = $(event.target).closest('tr').attr('row')
        runToThisLine()
    })
}


function runToThisLine() {
    if (replayTimer !== null) {
        clearTimeout(replayTimer)
    }
    let packetPackage = []
    console.log('lineToSend: %s  runTo: %s', lineToSend, runTo)
    for (lineToSend; lineToSend < runTo; lineToSend++) {


        if (allLines[lineToSend].type === 'packet' && lineToSend <= totalPackets) {
            packetPackage.push(allLines[lineToSend].packet)
        }
        else if (allLines[lineToSend].type !== 'packet') {
            console.log('Skipping packet %s', lineToSend)
        }
        console.log('lineToSend:', lineToSend)
        $('*[row="' + lineToSend + '"] td').first().html($('<button>').prop('disabled', 'disabled').append($('<i>').addClass('fas').addClass('fa-angle-down')))


    }
    $('*[row="' + lineToSend + '"] td').first().html($('<button>').prop('disabled', 'disabled').append($('<i>').addClass('fas').addClass('fa-angle-down')))
    socket.emit('receivePacketRaw', packetPackage)
    console.log('sending up to #%s %s', lineToSend, packetPackage.toString())
    $('#packetCount').val(lineToSend + " of " + totalPackets)
}


$(function () {
    init()
})
