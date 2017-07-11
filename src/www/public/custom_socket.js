$(function () {

    var socket = io();
    var val;




    $("#ipButton").on("click", function() {
      val = $('#ip_addr').val()
      console.log("Send IP button clicked.  Will send %s", val)
      socket.emit('ip_addr', val)
    });

    $("#echoButton").on("click", function() {
      val = $('#ip_addr').val()
      console.log("Echo button clicked.  Will send %s", val)
      socket.emit('echo', val)
    });


    socket.on('connect', function(data) {
      if (data !== null) {
        $('#div_1').html(data);
      }
    });

    socket.on('echo', function(data) {
      if (data !== null) {
        $('#div_2').html(data);
      }
    });


});
