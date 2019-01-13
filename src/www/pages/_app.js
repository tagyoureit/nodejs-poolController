


  import React from 'react'
import App, { Container } from 'next/app'

// HACK: Reload CSS in development
//       Remove when this issue is resolved:
//       https://github.com/zeit/next-plugins/issues/282
import Router from 'next/router';
Router.onRouteChangeComplete = () => {
  if (process.env.NODE_ENV !== 'production') {
    const els = document.querySelectorAll('link[href*="/_next/static/css/styles.chunk.css"]');
    const timestamp = new Date().valueOf();
    els[0].href = '/_next/static/css/styles.chunk.css?v=' + timestamp;
  }
}

export default class MyApp extends App {

    


  static async getInitialProps({ Component, router, ctx }) {
    
    let pageProps = {}

    if (Component.getInitialProps) {
      pageProps = await Component.getInitialProps(ctx)
    }

    return { pageProps }
  }

  render () {
   
    const { Component, pageProps } = this.props

    return (
      <Container>
        <Component {...pageProps} />
      </Container>
    )
  }
}