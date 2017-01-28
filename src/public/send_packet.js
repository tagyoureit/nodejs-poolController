$(function () {
    

    // Initialize variables



    var $window = $(window);

    var socket = io();



    $("#send").click(function(){
        //alert('clicked send with ' + $('#packet').val() )
        socket.emit('sendPacket',$('#packet').val())
    });
    
    
    // Whenever the server emits 'searchResults', update the page

    socket.on('sendPacketResults', function (data) {
        //alert('received data %s', data)
        $( "#results" ).append( "<p>"+data+"</p>" );
        
    });

});