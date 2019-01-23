import {Button} from 'reactstrap'

class RefreshCounter extends React.Component {
  constructor(props) {
    super(props)


    this.timer;
    this.resetTimer = this.resetTimer.bind(this)
    this.startTimer = this.startTimer.bind(this)
    this.tick = this.tick.bind(this)

    this.state =  {
      seconds: 0
    }
  }

  componentDidMount() {
    //console.log(`TIMER MOUNTED!  Woot.  ${this.props.counter}`)
    this.startTimer();
  }

  componentDidUpdate(prevProps) {
    if (prevProps.counter !== this.props.counter) {
      //console.log(`Woot!  New socket received.`)
      this.resetTimer()
    }
  }
  componentWillMount() {
    clearInterval(this.timer)
  }

  resetTimer() {
    clearInterval(this.timer)
    this.setState(() => {
      return {
        seconds: 0
      }
    })
    this.startTimer()
  }

  startTimer() {
    //console.log(`startTimer...`)
    this.timer = setInterval( this.tick, 1000)
  }

  tick() {
    //console.log(`tick`)
    this.setState((state) => {
      return {
        seconds: state.seconds + 1
      }
    })
  }

  render() {
    

    return (

      <div>

<Button 
color={this.state.seconds>60?'danger':this.state.seconds>10?'warning':'success'}
size="sm"
>
        Last update: {this.state.seconds}s
</Button>
      </div>

    )
  }
}

export default RefreshCounter;