import React from 'react';
import ReactDOM from 'react-dom';
import NodeJSPoolController from './poolController'

const App = () => {
    return (
        <div>
            <NodeJSPoolController />
        </div>
    )
}

ReactDOM.render(<App />, document.getElementById('root'))