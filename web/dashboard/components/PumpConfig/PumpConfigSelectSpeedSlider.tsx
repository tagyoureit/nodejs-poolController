import { Container, Row, Col, Button } from 'reactstrap'
import Slider from 'react-rangeslider'
import 'react-rangeslider/lib/index.css'
import '../../css/rangeslider.css'
import * as React from 'react';
import { setPumpConfigRate } from '../../components/Socket_Client'

interface Props
{
  currentSpeed: number
  currentPump: number
  units: 0|1
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
    console.log( `changing pump=${ this.props.currentPump } currentSpeed=${ this.props.currentSpeed } ${ this.props.units?'gpm':'rpm' } currentCircuitSlot=${ this.props.currentCircuitSlotNum } to speed ${ this.state.desiredSpeed }` )

    setPumpConfigRate( this.props.currentPump, this.props.currentCircuitSlotNum, this.state.desiredSpeed )
  }

  render ()
  {
    const customLabels = () =>
    {
      if ( this.props.units )
      {
        return { 15: "15", 130: "130" }
      }
      else
      {
        return { 450: "450", 3450: "3450" };
      }
    }
    return (
     
       
                <Slider
          value={this.state.desiredSpeed}
          onChange={this.onChangeSpeed}
          onChangeComplete={this.onChangeComplete}
          min={this.props.units? 15 : 450}
          max={this.props.units? 130 : 3450}
          step={this.props.units? 1 : 10}
          labels={customLabels()}
        />
      
    )
  }
}

export default PumpConfigSelectSpeedSlider;