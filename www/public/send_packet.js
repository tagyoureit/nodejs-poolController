var socket
var arrToBeSent = {"1": ''}
var count = 0

$(function() {


    // Initialize variables



    var $window = $(window);

    socket = io();

    $("#reset").click(function() {

        count = 0
        arrToBeSent = {"1": ''}
        $('#queue').html('Queue empty...')
    });


    $("#add").click(function() {

        var tempVal = $('#packet').val().split(',');
        var tempArray = [];

        for (var index in tempVal){
          console.log(tempVal[index])
          tempArray.push(parseInt(tempVal[index],10))
        }
        var len = arrToBeSent.length
        count++
        arrToBeSent[count.toString()] = tempArray;
        $('#queue').html(JSON.stringify(arrToBeSent))
    });


    $("#send").click(function() {
        //alert('clicked send with ' + $('#packet').val() )
        socket.emit('sendPacket', arrToBeSent)
    });

    $("#receive").click(function() {
        //alert('clicked send with ' + $('#packet').val() )
        socket.emit('receivePacket', arrToBeSent)
    });


    // Whenever the auth emits 'searchResults', update the page

    socket.on('sendPacketResults', function(data) {
        $("#results").append("<p>" + data + "</p>");

    });

});
