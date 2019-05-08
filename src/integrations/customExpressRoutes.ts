import { Router } from 'express-serve-static-core';

// This file is an example of how to add new custom routes to Express

export function init ( app:Router )
{
    app.get('/api/myruntimeroute', function(req,res) {
        res.send({"runtime" : "route"});
    })
}
