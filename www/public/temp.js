$(function () {

    var socket = io();
    var val;




    $("#poolIncButton").on("click", function() {
      val = $('#poolVal').val()
      console.log("pool increment button clicked.  Will increment by %s", val)
      socket.emit('incrementPoolSetPoint', val)
    });

    $("#poolDecButton").on("click", function() {
      val = $('#poolVal').val()
      console.log("pool decrement button clicked.  Will decrement by %s", val)
      socket.emit('decrementPoolSetPoint', val)
    });

    $("#poolSetButton").on("click", function() {
      val = $('#poolVal').val()
      console.log("pool set button clicked.  Will set to %s", val)
      socket.emit('setPoolSetPoint', val)
    });


    $("#spaIncButton").on("click", function() {
      val = $('#spaVal').val()
      console.log("spa increment button clicked.  Will increment by %s", val)
      socket.emit('incrementSpaSetPoint', val)
    });

    $("#spaDecButton").on("click", function() {
      val = $('#spaVal').val()
      console.log("spa decrement button clicked.  Will decrement by %s", val)
      socket.emit('decrementSpaSetPoint', val)
    });

    $("#spaSetButton").on("click", function() {
      val = $('#spaVal').val()
      console.log("spa set button clicked.  Will set to %s", val)
      socket.emit('setSpaSetPoint', val)
    });


    socket.on('temperatures', function(data) {
      if (data !== null) {
        $('#poolHeatSetPoint').html(data.poolSetPoint);
        $('#spaHeatSetPoint').html(data.spaSetPoint);
      }
    });



});
