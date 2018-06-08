const checkEnvVars = () => {

  require('dotenv').config() // eslint-disable-line

  // Required environment variables
  const envVars = {
    public: ['NODE_ENV', 'PORT'],
    private: ['NEW_RELIC'],
  }

  // Exit if an environment variable isn't set
  const checkValue = ({ value, name }) => {
    if (value == null) {
      winston.error(`checkEnvVars - Environment variable '${name}' is not set.`)
      process.exit(1);
    }
  }

  envVars.public.forEach((name) => {
    const value = process.env[name]
    winston.info(`checkEnvVars - '${name}' = '${value}'`)
    checkValue({ value, name })
  })
  envVars.private.forEach((name) => {
    const value = process.env[name]
    checkValue({ value, name })
  })
}

module.exports = {
  checkEnvVars
}