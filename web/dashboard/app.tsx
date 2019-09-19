import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { BrowserRouter as Router, Route, Link } from "react-router-dom";
import NodeJSPoolController from './components/PoolController'
import UtilitiesLayout from './components/utilities/UtilitiesLayout'
import PacketSnifferController from './components/utilities/PacketSnifferController' 
import PacketTester from './components/utilities/PacketTester' 
import Replay from './components/utilities/Replay' 
const App = () => {
    return (
            <NodeJSPoolController />
    )
}

 const Utilities = () =>
{
    return (
        <UtilitiesLayout />
    )
}

const packetSniffer = () =>
{
    return (
        <PacketSnifferController />
    )
}

const packetTester = () =>
{
    return (
        <PacketTester />
    )
}
const replay = () =>
{
    return (
        <Replay />
    )
} 
ReactDOM.render(
    <Router>
        <Route exact path="/" component={App}/>
        <Route path="/packetSniffer" component={packetSniffer} />
        <Route path="/utilities" component={Utilities} />
        <Route path='/packetTester' component={packetTester} />
        <Route path='/replay' component={replay} />
    </Router>,
    document.getElementById('root')
  );