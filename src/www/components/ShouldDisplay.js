import React from 'react'


class ShouldDisplay extends React.Component {

    constructor(props) {
        super(props);

    }

    render() {
        console.log(`this.props`)
        console.log(this.props)
        console.log(`props.state:`)
        console.log(this.props.state)
        // state = is the compenent hidden or visible per the configuration settings
        // ready = is the component loaded?  true or false
        let content ='Loading....'
        let display = {display: 'block'}
        if (this.props.state==='hidden'){
            dislay={display: 'none'}
        }
        else if (this.props.state === 'visible'){
            display={display: 'block'}
            if (this.props.ready){
               content =  this.props.children
            }
            else {
               content = loading
            }

        }

        return (

            <div style={display}>
              {content} 
            </div>

        )
    }

}
export default ShouldDisplay;