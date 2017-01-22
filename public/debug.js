$(function () {
    

    // Initialize variables



    var $window = $(window);
    var $status = $('.status'); //status area
    var $input = $('equipmentChange')

    var $statusPage = $('.status.page') // The status page


    var socket = io();



    $("#stop").click(function(){
        //alert('clicked stop')
        socket.emit('search',"stop")
    });
    
    $("#start").click(function(){
        //alert ( $("#searchSrc").val() );
        var src = $("#searchSrc").val();
        var dest = $("#searchDest").val()
        var action = $("#searchAction").val()
        //alert('clicked start with values' + src + ' ' + dest + ' ' + action)
        socket.emit('search','start',src,dest,action)
    })

    
    // Whenever the server emits 'searchResults', update the page

    socket.on('searchResults', function (data) {
        //alert('received data %s', data)
        $( "#results" ).append( "<p>"+data+"</p>" );
        
    });

});