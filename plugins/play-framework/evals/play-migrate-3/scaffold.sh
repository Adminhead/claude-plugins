#!/usr/bin/env bash
set -euo pipefail
mkdir -p project conf app/controllers app/jobs
cat > project/plugins.sbt <<'J'
addSbtPlugin("com.typesafe.play" % "sbt-plugin" % "2.9.6")
J
cat > project/build.properties <<'J'
sbt.version=1.10.1
J
cat > build.sbt <<'J'
name := "orders"
version := "1.0"
scalaVersion := "2.13.14"

lazy val root = (project in file(".")).enablePlugins(PlayScala)

libraryDependencies ++= Seq(
  guice,
  jdbc,
  "com.typesafe.play" %% "play-json" % "2.10.5",
  "com.typesafe.akka" %% "akka-actor-typed" % "2.6.21",
  "org.scalatestplus.play" %% "scalatestplus-play" % "6.0.1" % Test
)
J
cat > conf/application.conf <<'J'
play.http.secret.key = ${?APPLICATION_SECRET}

akka {
  loggers = ["akka.event.slf4j.Slf4jLogger"]
  logging-filter = "akka.event.slf4j.Slf4jLoggingFilter"
}

play.server.provider = "play.core.server.AkkaHttpServerProvider"
J
cat > conf/routes <<'J'
GET  /orders/:id  controllers.OrderController.show(id: Long)
J
cat > app/controllers/OrderController.scala <<'J'
package controllers

import akka.actor.ActorSystem
import javax.inject.{Inject, Singleton}
import play.api.mvc._

@Singleton
class OrderController @Inject() (cc: ControllerComponents, system: ActorSystem)
    extends AbstractController(cc) {
  def show(id: Long) = Action { Ok(s"order $id") }
}
J
cat > app/jobs/Mailer.scala <<'J'
package jobs

import akka.actor.{Actor, Props}

class Mailer extends Actor {
  def receive = { case msg => println(msg) }
}
object Mailer { def props = Props(new Mailer) }
J
