import { Button, Tooltip } from 'reactstrap'
import * as React from 'react';

interface State
{
  seconds: number;
  tooltipOpen: boolean;
}

interface Props
{
  counter: number;
}

class RefreshCounter extends React.Component<Props, State> {
  timer: NodeJS.Timeout;
  constructor( props: Props )
  {
    super( props )

    // this.timer;
    this.resetTimer = this.resetTimer.bind( this )
    this.startTimer = this.startTimer.bind( this )
    this.tick = this.tick.bind( this )
    this.toggle = this.toggle.bind( this );

    this.state = {
      seconds: 0,
      tooltipOpen: false
    }
  }

  componentDidMount ()
  {
    if ( this.timer )
    {
      this.resetTimer()
    }
    this.startTimer();
  }

  componentDidUpdate ( prevProps: Props )
  {
    if ( prevProps.counter !== this.props.counter )
    {
      this.resetTimer()
    }
  }
  componentWillMount ()
  {
    if ( this.timer )
    {
      this.resetTimer()
    }
  }

  resetTimer ()
  {
    clearInterval( this.timer )
    this.setState( () =>
    {
      return {
        seconds: 0
      }
    } )
    this.startTimer()
  }

  startTimer ()
  {
    this.timer = setInterval( this.tick, 1000 )
  }

  tick ()
  {
    this.setState( ( state ) =>
    {
      return {
        seconds: state.seconds + 1
      }
    } )
  }

  toggle ()
  {
    this.setState( {
      tooltipOpen: !this.state.tooltipOpen
    } );
  }


  render ()
  {

    let _color = this.state.seconds > 120 ? 'red' : this.state.seconds > 60 ? 'yellow' : 'green';
    let _str = `Last update: ${this.state.seconds}s`;

    return (
        <span className='ml-3' style={{
          borderRadius: '50%',
          width: '10px',
          height: '10px',
        background: _color,
        display:'inline-block'
        }} id='stateToolTip'>
          <Tooltip placement="top" isOpen={this.state.tooltipOpen} target="stateToolTip" toggle={this.toggle}>
            {_str}
        </Tooltip>
        </span>
    )
  }
}

export default RefreshCounter;