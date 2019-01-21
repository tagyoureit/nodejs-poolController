
let count = 0
let cumulative = 0
let isOn = false
let timer = null;

class RefreshCounter extends React.Component {
  constructor(props) {
    super(props)

    this.startTimer = this.startTimer.bind(this)
    this.stopTimer = this.stopTimer.bind(this)
    this.resetTimer = this.resetTimer.bind(this)
    this.update = this.update.bind(this)


  }

  state = {
    time: 0
  }

  timer = null;
  startTimer() {
    if (!isOn) {
      count++
      console.log(`count! ${count}`)


      cumulative = 0
      // timer = setInterval(() => {



      //   cumulative = cumulative + 1;
      //   this.setState({ time: cumulative })
      // }
      //   , 1000)

      isOn = true

    }
  }

  stopTimer() {
    isOn = false
    clearInterval(timer)

  }
  resetTimer() {
    cumulative = 0
    isOn = false
  }

  update() {
    console.log('update interval...')

    cumulative = cumulative + 1
    this.setState((state) => {
      time: state.time + 1
    })

  }
  /* 
        componentDidUpdate(prevProps) {
         console.log('will update')
        } */

  render() {
    () => this.startTimer()

    return (

      <div>


        {this.props.refresh}
        <br />
        {this.state.time}
      </div>
    );
  }
}

export default RefreshCounter;