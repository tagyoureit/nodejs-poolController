$(function () {


    // Initialize variables



    var $window = $(window);
    var $status = $('.status'); //status area
    var $input = $('equipmentChange')

    var $statusPage = $('.status.page') // The status page


    var socket = io();

    $("#clear").click(function(){
        $('#results').text('Results')
    });

    $("#stop").click(function(){
        //alert('clicked stop')
        socket.emit('search',"stop")
    });

    $("#start").click(function(){
        //alert ( $("#searchSrc").val() );
        var src = -1
        if ($("#searchSrc").val()!==''){
            src =$("#searchSrc").val()
        }
        var dest = -1
        if ($("#searchDest").val()!==''){
            dest = $("#searchDest").val()
        }
        var action = -1
        if ($("#searchAction").val()!==''){
            action = $("#searchAction").val()
        }
        console.log('clicked start with values src: %s  dest: %s  action: %s', src,  dest, action)
        socket.emit('search','start',src,dest,action)
    })


    // Whenever the auth emits 'searchResults', update the page

    socket.on('searchResults', function (data) {
        //alert('received data %s', data)
        $( "#results" ).append( "<p>"+data+"</p>" );

    });

    //emit once upon load
    socket.emit('search','load');

});
