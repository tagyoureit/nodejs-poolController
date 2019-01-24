import {
    Row, Col, Table, Card, CardImg, CardText, CardBody,
    CardTitle, CardSubtitle, Button, ButtonGroup
} from 'reactstrap';

import Link from 'next/link'
import DateTime from './DateTime'
import CustomCard from '../components/CustomCard'




import { setHeatMode, setHeatSetPoint } from '../components/Socket_Client'



class Schedule extends React.Component {

    constructor(props) {
        super(props)


    //     this.state = {
    //         setPoint: 0
            
    //       }

    //     this.handleToggleState = this.handleToggleState.bind(this)
    //     this.changeHeat = this.changeHeat.bind(this)
    //    // this.changeTempVal = this.changeTempVal.bind(this)

    //       //console.log(`evaling state.setpoint`)
    //    if (this.state.setPoint!==this.props.data.setPoint){
    //        this.setState({setPoint: this.props.data.setPoint})
    //    }
    }




  /*   handleToggleState(){
        //console.log(`toggle ${this.state.data.name} val`)
    }

    changeHeat = mode => {

            //console.log(`changing ${mode} for ${this.props.data.name}`)
            setHeatMode(this.props.data.name, mode)
    }

      changeSetPointVal = (setPoint) => {
          if (this.state.setPoint!==setPoint){
             
          //console.log(`setPoint change! ${setPoint}`)
        this.setState({
          setPoint: setPoint
        });
    }
      };

    changeSetPointComplete = () => {
        console.log(`changing ${this.state.setPoint} for ${this.props.data.name}`)
        setHeatSetPoint(this.props.data.name, this.state.setPoint)
    } */

    buttons(schedule) {
        let days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday' ]
        let res = [];
        
        days.map(day => {
            if (schedule.DAYS.includes(day)){
                
                res.push (<Button key={day+'button'} color="success">{day.substring(0,1)}</Button>)
            }
            else {
                res.push (<Button key={day+'button'} color="secondary">{day.substring(0,1)}</Button>)
            }
            
        })
        return res;
    }

    render() {
        
        let schedules;
        if (this.props.data!==undefined){
            schedules =  Object.entries(this.props.data).map((k) => {

                return (
                    <Row key={k[1].ID+'row'}>
                        <Col  key={k[1].ID+'col'}>
                            {k[1].friendlyName} ({k[1].ID})
                           
                        </Col>
                        <Col>
                            {k[1].START_TIME}
                        </Col>
                        <Col>
                            {k[1].END_TIME}
                        </Col>
                        <Col>
                    <ButtonGroup>
{this.buttons(k[1])}

                    </ButtonGroup>
                        
                        </Col>
                    </Row>
                    
                    
                    
                    
                    )
    
    
            })
        }  
        else {
            return (<div>No schedules yet</div>)
        }
    
       


        return (
         
            <div>           


                        <a name='Schedule' className="anchor"></a>
                        <CustomCard name='Schedule'>
                        
                        
                        {schedules}
                   {/* 
                            <Row>
                                <Col>Pool State
                                </Col>
                                <Col>
                                    {this.props.data.state}
                                </Col>
                            </Row>
                         
                    
                            <Row>
                                <Col>Temp</Col>
                                <Col>{this.props.data.temp}
                          
                                
                                 </Col>
                            </Row>
                    
                            <Row>
                                <Col>
                               Heater Mode
                               {this.props.data.heatModeStr} ({this.props.data.heatMode})
                                <div className='text-center'>
                                <ButtonGroup >
                                    <Button onClick={() => this.changeHeat(0)} color={this.props.data.heatMode===0?'success':'secondary'}>Off</Button>
                                    <Button onClick={() => this.changeHeat(1)} color={this.props.data.heatMode===1?'success':'secondary'}>Heater</Button>
                                    <Button onClick={() => this.changeHeat(2)} color={this.props.data.heatMode===2?'success':'secondary'}>Solar Pref</Button>
                                    <Button onClick={() => this.changeHeat(3)} color={this.props.data.heatMode===3?'success':'secondary'}>Solar</Button>
                                </ButtonGroup>
                                </div>
                                </Col>
                            </Row>
                           
                       */}

                        
                        
                        </CustomCard>
                    
                





            </div>



        );
    }
}

export default Schedule;