import { Container, Row, Col, Button } from 'reactstrap'
import Slider from 'react-rangeslider'
import 'react-rangeslider/lib/index.css'
import '../../css/rangeslider.css'
import * as React from 'react';
import { setPumpConfigSpeed } from '../../components/Socket_Client'

interface Props
{
  currentSpeed: number
  currentPump: Pump.PumpIndex
  currentFlag: Pump.PumpSpeedType
  currentCircuitSlotNum: number
}

interface State
{
  desiredSpeed: number;
}

class PumpConfigSelectSpeedSlider extends React.Component<Props, State> {
  constructor( props: Props )
  {
    super( props )

    this.state = {
      desiredSpeed: props.currentSpeed
    }
    this.onChangeSpeed = this.onChangeSpeed.bind( this )
  }

  componentDidUpdate ( prevProps: Props )
  {

    if ( prevProps.currentSpeed !== this.props.currentSpeed
    )
      this.setState( { desiredSpeed: this.props.currentSpeed } )
  }

  onChangeSpeed = ( _speed: number ) =>
  {
    this.setState( () =>
    {
      return {
        desiredSpeed: _speed,
      }
    } )
  }

  onChangeComplete = () =>
  {
    console.log( `changing pump ${ this.props.currentPump } currentSpeed ${ this.props.currentSpeed } ${ this.props.currentFlag } currentCircuitSlot ${ this.props.currentCircuitSlotNum } type to speed ${ this.state.desiredSpeed }` )

    setPumpConfigSpeed( this.props.currentPump as Pump.PumpIndex, this.props.currentCircuitSlotNum, this.state.desiredSpeed )
  }

  render ()
  {
    const customLabels = () =>
    {
      if ( this.props.currentFlag === 'rpm' )
      {
        return { 450: "450", 3450: "3450" };
      }
      else
      {
        return { 15: "15", 130: "130" }
      }
    }
    return (
     
       
                <Slider
          value={this.state.desiredSpeed}
          onChange={this.onChangeSpeed}
          onChangeComplete={this.onChangeComplete}
          min={this.props.currentFlag === 'rpm' ? 450 : 15}
          max={this.props.currentFlag === 'rpm' ? 3450 : 130}
          step={this.props.currentFlag === 'rpm' ? 10 : 1}
          labels={customLabels()}
        />
      
    )
  }
}

export default PumpConfigSelectSpeedSlider;