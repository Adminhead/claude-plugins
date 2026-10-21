#!/usr/bin/env bash
set -euo pipefail
mkdir -p src/main/scala/shapes project
echo 'sbt.version=1.10.7' > project/build.properties
cat > build.sbt <<'J'
ThisBuild / scalaVersion := "3.3.4"

lazy val root = (project in file("."))
  .settings(
    name := "shapes",
    scalacOptions ++= Seq("-no-indent", "-deprecation")
  )
J
cat > src/main/scala/shapes/Shapes.scala <<'J'
package shapes

sealed trait Shape {
  def area: Double
}

object Shape {
  final case class Circle(radius: Double) extends Shape {
    def area: Double = math.Pi * radius * radius
  }

  final case class Rect(width: Double, height: Double) extends Shape {
    def area: Double = width * height
  }
}
J
