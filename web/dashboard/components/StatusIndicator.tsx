import { Button, Tooltip } from 'reactstrap'
import * as React from 'react';
import { IDetail } from './PoolController';

interface State
{
  seconds: number;
  tooltipOpen: boolean;
}

interface Props
{
  status: IDetail & { percent?: number }
  counter: number;
}

class StatusIndicator extends React.Component<Props, State> {
  timer: NodeJS.Timeout;
  constructor( props: Props )
  {
    super( props )
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
    if ( !this.timer ) this.startTimer();
  }

  componentDidUpdate ( prevProps: Props )
  {
    if ( prevProps.status.val !== this.props.status.val || prevProps.status.percent !== this.props.status.percent || prevProps.counter !== this.props.counter )
    {
      this.resetTimer()
    }
  }
  resetTimer ()
  {
    clearInterval( this.timer )
    this.setState( () =>
    {
      return {seconds: 0 }
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

    let { percent, val, desc } = this.props.status;
    let _color = 'red'
    let _label = desc;
    if ( val === 0 )
    {
      _color = 'green';
    }
    else if ( val > 100 )
    {
      _color = 'red';
    }
    else
    {
      _color = 'yellow';
      _label = `${ desc }: ${ percent }%`
    }
    let toolTipText = `Last update: ${ this.state.seconds }s`;

    return (
      <div>
        {_label}
        <span className='ml-3' style={{
          borderRadius: '50%',
          width: '10px',
          height: '10px',
          background: _color,
          display: 'inline-block',
          boxShadow: '2px 2px 3px 0px rgba(50, 50, 50, 0.75)'
        }} id='stateToolTip'>
          <Tooltip placement="top" isOpen={this.state.tooltipOpen} target="stateToolTip" toggle={this.toggle}>
            {toolTipText}
          </Tooltip>
        </span>
      </div>
    )
  }
}

export default StatusIndicator;