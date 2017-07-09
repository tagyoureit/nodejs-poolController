module.exports= {
    init : init
};

function init(app){
    app.get('/api/myruntimeroute', function(req,res) {
        res.send({"runtime" : "route"});
    })
}
